import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
if (process.env.GDG_LOCAL_TEST_SHARED_SESSION === "true")
  throw Error("Requires isolated fictional sessions.");
const h = await localHttp(),
  { db, call } = h,
  id = randomUUID(),
  email = "fictional-cms-" + id + "@example.test",
  password = "Fictional-cms-" + randomUUID(),
  tests = [];
const base = "/admin/site-content/navigation",
  label = "Fictional private navigation " + id.slice(0, 8);
let created = false,
  recordId,
  resourceId,
  cleanup = false;
const data = (r) => {
  if (r.status !== 200)
    throw Error(
      "CMS recovery request failed " + r.status + " " + r.json?.error?.code,
    );
  return r.json.data;
};
function checked(r) {
  if (r.error) throw Error("CMS recovery fixture error " + r.error.code);
  return r.data;
}
function check(ok, name) {
  if (!ok) throw Error("FAIL " + name);
  tests.push({ name, passed: true });
  console.info("PASS " + name);
}
const write = (p, body, method = "POST", key) => call(p, { method, body, key });
try {
  checked(
    await db.from("admin_users").insert({
      id,
      email,
      password_hash: await hashSecret(password),
      role: "admin",
      is_active: true,
      display_name: "Fictional CMS recovery officer",
    }),
  );
  created = true;
  data(await write("/auth/gate", { code: h.credentials.gateCode }));
  data(await write("/auth/login", { email, password }));
  check(
    (await call(base, { anonymous: true })).status === 401,
    "anonymous CMS inventory denied",
  );
  check(
    data(await call(base + "/capabilities")).actions.includes("update"),
    "fresh officer receives current CMS action grants",
  );
  const creation = { record: { label, href: "/events", order_index: 0 } },
    creationKey = randomUUID();
  check(
    (await write(base, creation, "POST", null)).status === 400,
    "CMS mutation rejects a missing retry key",
  );
  const concurrent = await Promise.all(
    Array.from({ length: 10 }, () =>
      write(base, creation, "POST", creationKey),
    ),
  );
  const first = data(concurrent[0]).record;
  recordId = first.id;
  check(
    concurrent.every(
      (r) => r.status === 200 && r.json.data.record.id === recordId,
    ) &&
      checked(
        await db.from("admin_actions").select("id").eq("target_id", recordId),
      ).length === 1,
    "ten simultaneous CMS retries create one record and one audit entry",
  );
  check(
    (
      await write(
        base,
        { record: { ...creation.record, label: label + " changed" } },
        "POST",
        creationKey,
      )
    ).status === 409,
    "changed CMS payload conflicts with reused retry key",
  );
  check(
    !first.is_active && first.revision === 1,
    "new synthetic navigation is a private draft",
  );
  check(
    data(await call(base + "/" + recordId)).items[0].label === label,
    "selected CMS detail resolves the current saved record",
  );
  check(
    !data(await call("/public/home", { anonymous: true })).navigation.some(
      (r) => r.id === recordId || r.label === label,
    ),
    "private navigation is absent from public projection",
  );
  check(
    data(await call("/admin/site-content/preview?page=home")).navigation.some(
      (r) => r.id === recordId,
    ),
    "private composition includes only the saved synthetic draft",
  );
  const updateKey = randomUUID(),
    updateBody = {
      revision: 1,
      record: { label: label + " revised", href: "/events", order_index: 1 },
    };
  const updated = data(
    await write(
      base + "/" + recordId,
      {
        revision: 1,
        record: { label: label + " revised", href: "/events", order_index: 1 },
      },
      "PATCH",
      updateKey,
    ),
  ).record;
  check(
    data(await write(base + "/" + recordId, updateBody, "PATCH", updateKey))
      .record.revision === 2,
    "unchanged CMS update retry returns its original revision",
  );
  check(
    updated.revision === 2 && !updated.is_active,
    "CMS update increments revision while remaining private",
  );
  check(
    (
      await write(
        base + "/" + recordId,
        {
          revision: 1,
          record: { label: label + " stale", href: "/events", order_index: 1 },
        },
        "PATCH",
      )
    ).status === 409,
    "obsolete CMS update cannot overwrite current copy",
  );
  const archiveKey = randomUUID();
  const archived = data(
    await write(
      base + "/" + recordId,
      { revision: updated.revision, action: "archive" },
      "DELETE",
      archiveKey,
    ),
  ).record;
  check(
    data(
      await write(
        base + "/" + recordId,
        { revision: updated.revision, action: "archive" },
        "DELETE",
        archiveKey,
      ),
    ).record.revision === archived.revision,
    "archive retry does not increment a retained record again",
  );
  check(
    !!archived.deleted_at && !archived.is_active,
    "synthetic navigation archival is recoverable",
  );
  check(
    data(await call(base + "/" + recordId + "?state=trash")).items[0].id ===
      recordId,
    "archived selected detail remains in its authorized inventory",
  );
  const resourcePath = "/admin/content-records/resources",
    resourceKey = randomUUID(),
    resourceBody = {
      teamId: null,
      record: {
        title: "Fictional retry resource " + id.slice(0, 8),
        description: "Private loopback retry fixture",
        type: "documentation",
      },
    };
  check(
    (await write(resourcePath, resourceBody, "POST", null)).status === 400,
    "collection mutation rejects a missing retry key",
  );
  const resource = data(
    await write(resourcePath, resourceBody, "POST", resourceKey),
  ).record;
  resourceId = resource.id;
  check(
    data(await write(resourcePath, resourceBody, "POST", resourceKey)).record
      .id === resourceId,
    "collection create retry reuses the exact private resource",
  );
  checked(
    await db.from("admin_users").update({ is_active: false }).eq("id", id),
  );
  check(
    (await call(base)).status === 401,
    "deactivation revokes the next private CMS read",
  );
} finally {
  if (recordId) {
    const record = checked(
      await db
        .from("navigation_items")
        .select("id,label,revision,deleted_at,updated_by")
        .eq("id", recordId)
        .single(),
    );
    if (record.updated_by !== id || !record.label.startsWith(label))
      throw Error("CMS fixture ownership changed; no copy overwritten");
    if (!record.deleted_at)
      checked(
        await db
          .from("navigation_items")
          .update({
            deleted_at: new Date().toISOString(),
            is_active: false,
            revision: record.revision + 1,
          })
          .eq("id", recordId)
          .eq("revision", record.revision),
      );
  }
  if (resourceId) {
    const r = checked(
      await db
        .from("resources")
        .select("id,created_by,revision")
        .eq("id", resourceId)
        .single(),
    );
    if (r.created_by !== id) throw Error("Resource fixture ownership changed");
    checked(
      await db
        .from("resources")
        .update({
          deleted_at: new Date().toISOString(),
          is_active: false,
          revision: r.revision + 1,
        })
        .eq("id", resourceId)
        .eq("revision", r.revision),
    );
  }
  if (created) {
    checked(
      await db
        .from("admin_users")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .eq("id", id),
    );
    checked(
      await db
        .from("admin_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("admin_user_id", id)
        .is("revoked_at", null),
    );
  }
  cleanup = true;
  await writeFile(
    new URL("../.docs/phase0/local-cms-recovery.json", import.meta.url),
    JSON.stringify(
      {
        note: "Actual loopback CMS/content collection retries with one fresh fictional officer and new private navigation/resource drafts, including ten simultaneous identical CMS creates. Existing managed copy/roles untouched; no public publication, external provider, mail or user files. Synthetic records recoverably archived; account disabled/sessions revoked. Quotas/jobs never reset.",
        cleanup: { completed: cleanup },
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
