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
const write = (p, body, method = "POST") => call(p, { method, body });
try {
  checked(
    await db
      .from("admin_users")
      .insert({
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
  const first = data(
    await write(base, { record: { label, href: "/events", order_index: 0 } }),
  ).record;
  recordId = first.id;
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
  const updated = data(
    await write(
      base + "/" + recordId,
      {
        revision: 1,
        record: { label: label + " revised", href: "/events", order_index: 1 },
      },
      "PATCH",
    ),
  ).record;
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
  const archived = data(
    await write(
      base + "/" + recordId,
      { revision: updated.revision, action: "archive" },
      "DELETE",
    ),
  ).record;
  check(
    !!archived.deleted_at && !archived.is_active,
    "synthetic navigation archival is recoverable",
  );
  check(
    data(await call(base + "/" + recordId + "?state=trash")).items[0].id ===
      recordId,
    "archived selected detail remains in its authorized inventory",
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
        note: "Actual loopback CMS checks with one fresh fictional officer and a new private navigation draft. Existing managed copy/roles were untouched; no public publication, external provider, mail or user files. Synthetic record recoverably archived; account disabled/sessions revoked. Quotas/jobs never reset. Server mutation replay deduplication is not implemented or claimed.",
        cleanup: { completed: cleanup },
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
