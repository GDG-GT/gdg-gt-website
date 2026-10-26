import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import {
  managedPublicPages,
  publicPageSections,
} from "../shared/site-content.ts";
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
  name = "Fictional CMS " + randomUUID(),
  ledgerFile = new URL("../.docs/local-cms-fixture.local", import.meta.url);
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
  const candidates = managedPublicPages.flatMap((page) =>
    publicPageSections(page).map((section) => [page, section]),
  );
  let slot, reusable;
  let ledger;
  try {
    ledger = JSON.parse(await readFile(ledgerFile, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (ledger) {
    const existing = await db
      .from("page_content")
      .select("id,revision,page_slug,section_key,content,is_active,deleted_at")
      .eq("id", ledger.id)
      .maybeSingle();
    const row = existing.data;
    if (
      existing.error ||
      ledger.version !== 1 ||
      ledger.owner !== user.id ||
      !row ||
      !row.deleted_at ||
      row.is_active ||
      row.revision !== ledger.revision ||
      row.content?.title !== ledger.title ||
      row.content?.description !== "Local verification only" ||
      !/^Fictional CMS [0-9a-f-]{36}$/.test(ledger.title || "") ||
      !candidates.some(
        ([page, section]) =>
          row.page_slug === page && row.section_key === section,
      )
    )
      throw new Error(
        "CMS fixture ledger does not match an untouched archived fixture; refusing to modify copy.",
      );
    reusable = row;
    slot = [row.page_slug, row.section_key];
  }
  for (const [page, section] of slot ? [] : candidates) {
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
  if (reusable) {
    r = await call(prefix + "pages/" + reusable.id, {
      method: "POST",
      body: { revision: reusable.revision, action: "restore" },
    });
    if (r.status !== 200)
      throw new Error("Could not restore the ledger-owned CMS fixture.");
    reusable = r.json.data.record;
    records.push(["pages", reusable.id]);
  }
  r = await call(prefix + "pages" + (reusable ? "/" + reusable.id : ""), {
    method: reusable ? "PATCH" : "POST",
    body: {
      ...(reusable ? { revision: reusable.revision } : {}),
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
  if (!reusable) records.push(["pages", row.id]);
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
  const ownPage = records.find(([kind]) => kind === "pages");
  if (ownPage) {
    const verified = await db
      .from("page_content")
      .select("id,revision,content,is_active,deleted_at")
      .eq("id", ownPage[1])
      .single();
    const row = verified.data;
    if (
      verified.error ||
      !row?.deleted_at ||
      row.is_active ||
      row.content?.title !== name ||
      row.content?.description !== "Local verification only"
    )
      throw new Error(
        "CMS fixture cleanup was not confirmed; no reusable ledger was written.",
      );
    await writeFile(
      ledgerFile,
      JSON.stringify({
        version: 1,
        owner: user.id,
        id: row.id,
        title: name,
        revision: row.revision,
      }) + "\n",
      { mode: 0o600 },
    );
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
      note: "Real local CMS API/public serialization. Uses an unused slot or an untouched archived fictional fixture with matching private ledger, owner and revision; archives it again. Existing managed copy is never overwritten.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
