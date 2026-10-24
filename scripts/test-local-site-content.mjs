import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
const { call, login, logout, db } = await localHttp(),
  evidence = [],
  records = [];
function check(value, name) {
  if (!value) throw new Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS " + name);
}
const user = (await login()).user,
  prefix = "/admin/site-content/",
  name = "Fictional CMS " + randomUUID();
try {
  let r = await call(prefix + "pages", { anonymous: true });
  check(r.status === 401, "anonymous callers cannot list CMS drafts");
  r = await call(prefix + "settings", {
    method: "POST",
    body: { record: { key: "SUPABASE_SECRET_KEY", value: "forged" } },
  });
  check(
    r.status === 400,
    "CMS cannot change server credentials or arbitrary settings",
  );
  r = await call(prefix + "navigation", {
    method: "POST",
    body: { record: { label: "Private", href: "/admin" } },
  });
  check(
    r.status === 400,
    "public navigation cannot expose protected admin routes",
  );
  r = await call(prefix + "pages", {
    method: "POST",
    body: {
      record: {
        page_slug: "blog",
        section_key: "hero",
        content: { title: "Not public" },
      },
    },
  });
  check(r.status === 400, "CMS cannot reactivate public blog or project pages");
  const candidates = [
    ["resources", "header"],
    ["events", "header"],
    ["gallery", "header"],
    ["team", "header"],
  ];
  let slot;
  for (const [page, section] of candidates) {
    const existing = await db
      .from("page_content")
      .select("id")
      .eq("page_slug", page)
      .eq("section_key", section);
    if (!existing.error && !existing.data.length) {
      slot = [page, section];
      break;
    }
  }
  if (!slot)
    throw new Error("No unused test slot; refusing to overwrite managed copy.");
  r = await call(prefix + "pages", {
    method: "POST",
    body: {
      record: {
        page_slug: slot[0],
        section_key: slot[1],
        content: { title: name, description: "Local verification only" },
        order_index: 0,
      },
    },
  });
  check(
    r.status === 200 && !r.json.data.record.is_active,
    "page copy saves as a real private draft",
  );
  let row = r.json.data.record;
  records.push(["pages", row.id]);
  r = await call(prefix + "preview?page=" + slot[0], { anonymous: true });
  check(r.status === 401, "private page composition requires a real session");
  r = await call(prefix + "preview?page=" + slot[0]);
  check(
    r.status === 200 &&
      r.json.data.pages.some((p) => p.content.title === name) &&
      r.headers.get("cache-control") === "no-store" &&
      r.headers.get("x-robots-tag").includes("noindex") &&
      !r.text.includes("updated_by"),
    "private composition includes saved draft copy without exposing editor metadata or caching it",
  );
  r = await call("/public/home", { anonymous: true });
  check(
    r.status === 200 && !r.text.includes(name),
    "private CMS values do not enter the public aggregate",
  );
  const oldEtag = r.headers.get("etag");
  r = await call(prefix + "pages/" + row.id, {
    method: "POST",
    body: { revision: row.revision, action: "publish" },
  });
  check(
    r.status === 200 && r.json.data.record.is_active,
    "approved page copy publishes in a separate transaction",
  );
  row = r.json.data.record;
  r = await call("/public/home", { anonymous: true });
  check(
    r.status === 200 && r.text.includes(name) && !r.text.includes("updated_by"),
    "public aggregate includes published copy without editor identities",
  );
  check(
    r.headers.get("cache-control") ===
      "public, max-age=0, s-maxage=0, must-revalidate",
    "mutable CMS projections require shared-cache revalidation on every read",
  );
  const conditional = await fetch(
    new URL("/api/v1/public/home", (await localHttp()).env.APP_ORIGIN),
    {
      headers: { "If-None-Match": oldEtag },
      signal: AbortSignal.timeout(15000),
    },
  );
  check(
    conditional.status === 200 && (await conditional.text()).includes(name),
    "an old ETag cannot hide newly published copy behind a stale cache window",
  );
  r = await call(prefix + "pages/" + row.id, {
    method: "PATCH",
    body: {
      revision: 1,
      record: {
        page_slug: slot[0],
        section_key: slot[1],
        content: { title: "Stale" },
      },
    },
  });
  check(
    r.status === 409,
    "stale CMS edits cannot overwrite a published revision",
  );
  const navName = name + " nav";
  r = await call(prefix + "navigation", {
    method: "POST",
    body: {
      record: {
        label: navName,
        href: "/resources",
        parent_id: null,
        order_index: 20,
      },
    },
  });
  check(
    r.status === 200,
    "navigation order and destination persist server-side",
  );
  let nav = r.json.data.record;
  records.push(["navigation", nav.id]);
  r = await call(prefix + "navigation/" + nav.id, {
    method: "POST",
    body: { revision: nav.revision, action: "publish" },
  });
  check(r.status === 200, "navigation requires explicit publication");
  r = await call("/public/home", { anonymous: true });
  check(
    r.status === 200 &&
      r.json.data.navigation.some((item) => item.label === navName),
    "published navigation is available to the website shell",
  );
  r = await call(prefix + "pages/" + row.id, {
    method: "DELETE",
    body: { revision: row.revision },
  });
  check(
    r.status === 200 && r.json.data.record.deleted_at,
    "CMS archive is recoverable",
  );
  row = r.json.data.record;
  r = await call("/public/home", { anonymous: true });
  check(
    r.status === 200 &&
      !r.json.data.pages.some((item) => item.content.title === name),
    "archived page copy disappears from public aggregates",
  );
  r = await call(prefix + "pages/" + row.id, {
    method: "POST",
    body: { revision: row.revision, action: "restore" },
  });
  check(
    r.status === 200 && !r.json.data.record.is_active,
    "restoring CMS content does not publish it",
  );
  await db
    .from("admin_users")
    .update({ role: "blog_editor" })
    .eq("id", user.id);
  r = await call(prefix + "pages");
  check(r.status === 403, "editorial role cannot access site configuration");
  r = await call(prefix + "preview?page=home");
  check(
    r.status === 403,
    "revoked CMS permission also removes private preview access",
  );
} finally {
  const restored = await db
    .from("admin_users")
    .update({ role: user.role })
    .eq("id", user.id);
  if (restored.error) throw new Error("Could not restore fixture role");
  for (const [kind, id] of records) {
    const r = await call(prefix + kind + "/" + id + "?state=current"),
      row = r.json?.data?.items?.[0];
    if (r.status === 200 && row)
      await call(prefix + kind + "/" + id, {
        method: "DELETE",
        body: { revision: row.revision },
      });
  }
  await logout();
}
await writeFile(
  new URL(
    "../.docs/phase0/local-site-content-integration.json",
    import.meta.url,
  ),
  JSON.stringify(
    {
      note: "Real local CMS API/public serialization; only new fictional records used and archived. Existing copy was never overwritten.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
