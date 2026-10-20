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
  prefix = "/admin/content-records/";
try {
  let r = await call(prefix + "resources", { anonymous: true });
  check(
    r.status === 401,
    "anonymous callers cannot read private content inventory",
  );
  r = await call(prefix + "resources", {
    method: "POST",
    body: {
      record: {
        title: "Fictional resource",
        description: "Test content only",
        type: "documentation",
        is_active: true,
      },
    },
  });
  check(
    r.status === 400,
    "content creation rejects client-controlled publication",
  );
  r = await call(prefix + "resources", {
    method: "POST",
    body: {
      record: {
        title: "Fictional resource",
        description: "Test content only",
        type: "documentation",
        url: "https://127.0.0.1/private",
      },
    },
  });
  check(r.status === 400, "resource links reject private network destinations");
  const name = "Fictional content " + randomUUID();
  r = await call(prefix + "resources", {
    method: "POST",
    body: {
      record: {
        title: name,
        description: "Fictional resource for local verification",
        type: "documentation",
        url: "https://developers.google.com/",
        tags: ["local-verification"],
      },
    },
  });
  check(
    r.status === 200 &&
      r.json.data.record.revision === 1 &&
      !r.json.data.record.is_active &&
      r.json.data.record.views === 0,
    "new resources are private drafts with trusted initial counters",
  );
  let resource = r.json.data.record;
  records.push(["resources", resource.id]);
  r = await call("/resources?q=" + encodeURIComponent(name), {
    anonymous: true,
  });
  check(
    r.status === 200 && r.json.data.total === 0,
    "draft resource does not leak into public search",
  );
  r = await call(prefix + "resources/" + resource.id, {
    method: "POST",
    body: { revision: resource.revision, action: "publish" },
  });
  check(
    r.status === 200 && r.json.data.record.is_active,
    "publication is an explicit committed transition",
  );
  resource = r.json.data.record;
  r = await call("/resources?q=" + encodeURIComponent(name), {
    anonymous: true,
  });
  check(
    r.status === 200 &&
      r.json.data.total === 1 &&
      !r.text.includes("created_by") &&
      !r.text.includes("team_id"),
    "public resource projection excludes internal scope and authorship",
  );
  r = await call(prefix + "resources/" + resource.id, {
    method: "PATCH",
    body: {
      revision: resource.revision,
      record: { description: "Changed draft requires a new review" },
    },
  });
  check(
    r.status === 200 && !r.json.data.record.is_active,
    "editing published content returns it to private review",
  );
  resource = r.json.data.record;
  r = await call(prefix + "resources/" + resource.id, {
    method: "PATCH",
    body: { revision: 1, record: { title: "Stale edit" } },
  });
  check(
    r.status === 409,
    "optimistic revision prevents overwriting newer content",
  );
  r = await call(prefix + "resources/" + resource.id, {
    method: "POST",
    body: { revision: resource.revision, action: "duplicate" },
  });
  check(
    r.status === 200 &&
      r.json.data.record.id !== resource.id &&
      !r.json.data.record.is_active &&
      r.json.data.record.views === 0,
    "duplicate creates an independent private draft without inherited view counts",
  );
  records.push(["resources", r.json.data.record.id]);
  r = await call(prefix + "resources/" + resource.id, {
    method: "DELETE",
    body: { revision: resource.revision },
  });
  check(
    r.status === 200 && r.json.data.record.deleted_at,
    "archive preserves a recoverable record",
  );
  resource = r.json.data.record;
  r = await call(
    prefix + "resources?state=trash&q=" + encodeURIComponent(name),
  );
  check(
    r.status === 200 && r.json.data.items.some((row) => row.id === resource.id),
    "archived records remain visible in protected recovery inventory",
  );
  r = await call(prefix + "resources/" + resource.id, {
    method: "POST",
    body: { revision: resource.revision, action: "restore" },
  });
  check(
    r.status === 200 &&
      !r.json.data.record.deleted_at &&
      !r.json.data.record.is_active,
    "restoration never silently republishes content",
  );
  const fixtures = [
    [
      "sponsors",
      {
        name: name + " sponsor",
        logo_url: "/assets/event-hackathon.jpg",
        website_url: "https://developers.google.com",
        tier: "bronze",
      },
    ],
    [
      "sponsor-stats",
      {
        stat_label: name + " statistic",
        stat_value: "Test only",
        stat_description: "Fictional number, never a verified chapter metric",
        icon_name: "users",
      },
    ],
    [
      "team-profiles",
      {
        name: name + " profile",
        role: "Fictional reviewer",
        email: "private-profile@example.test",
        bio: "Local verification fixture",
      },
    ],
  ];
  for (const [kind, record] of fixtures) {
    r = await call(prefix + kind, { method: "POST", body: { record } });
    check(r.status === 200, "create real " + kind + " draft");
    let row = r.json.data.record;
    records.push([kind, row.id]);
    r = await call(prefix + kind + "/" + row.id, {
      method: "POST",
      body: { revision: row.revision, action: "publish" },
    });
    check(r.status === 200, "publish authorized " + kind + " record");
    const publicKind = kind === "team-profiles" ? "team" : kind;
    r = await call("/" + publicKind + "?q=" + encodeURIComponent(name), {
      anonymous: true,
    });
    check(
      r.status === 200 &&
        r.json.data.items.some((item) => item.id === row.id) &&
        !r.text.includes("private-profile@example.test"),
      "minimal public " + kind + " serialization excludes private contact data",
    );
  }
  await db
    .from("admin_users")
    .update({ role: "blog_editor" })
    .eq("id", user.id);
  r = await call(prefix + "resources");
  check(
    r.status === 403,
    "current-role revocation blocks content inventory immediately",
  );
} finally {
  const restored = await db
    .from("admin_users")
    .update({ role: user.role })
    .eq("id", user.id);
  if (restored.error) throw new Error("Could not restore local fixture role");
  for (const [kind, id] of records) {
    const r = await call(prefix + kind + "/" + id);
    if (r.status === 200 && !r.json.data.record.deleted_at)
      await call(prefix + kind + "/" + id, {
        method: "DELETE",
        body: { revision: r.json.data.record.revision },
      });
  }
  await logout();
}
await writeFile(
  new URL("../.docs/phase0/local-content-integration.json", import.meta.url),
  JSON.stringify(
    {
      note: "Actual local API/database content transitions with fictional fixtures archived afterward. No production content or cloud systems were changed.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
