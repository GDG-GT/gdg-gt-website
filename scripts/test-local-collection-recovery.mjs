import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
if (process.env.GDG_LOCAL_TEST_SHARED_SESSION === "true")
  throw Error("Requires isolated fictional sessions.");
const h = await localHttp(),
  { db, call } = h,
  actor = randomUUID(),
  email = "fictional-collection-" + actor + "@example.test",
  password = "Fictional-collection-" + randomUUID(),
  tests = [],
  owned = [];
const data = (r) => {
  if (r.status !== 200)
    throw Error(
      "Collection request failed " + r.status + " " + r.json?.error?.code,
    );
  return r.json.data;
};
const checked = (r) => {
  if (r.error) throw Error("Collection fixture error " + r.error.code);
  return r.data;
};
const check = (ok, name) => {
  if (!ok) throw Error("FAIL " + name);
  tests.push({ name, passed: true });
  console.info("PASS " + name);
};
const write = (path, body, method = "POST", key = randomUUID()) =>
  call(path, { method, body, key });
let created = false,
  completed = false;
try {
  checked(
    await db.from("admin_users").insert({
      id: actor,
      email,
      password_hash: await hashSecret(password),
      role: "admin",
      is_active: true,
      display_name: "Fictional collection recovery officer",
    }),
  );
  created = true;
  data(await write("/auth/gate", { code: h.credentials.gateCode }));
  data(await write("/auth/login", { email, password }));
  for (const [kind, table, record] of [
    [
      "resources",
      "resources",
      {
        title: "Fictional recovery resource",
        description: "Private collection recovery fixture",
        type: "documentation",
      },
    ],
    [
      "sponsors",
      "sponsors",
      {
        name: "Fictional recovery sponsor",
        logo_url: "/assets/event-workshop.jpg",
        tier: "bronze",
      },
    ],
    [
      "team-profiles",
      "team_members",
      {
        name: "Fictional recovery profile",
        role: "Fictional reviewer",
        team_section: "Active Members",
        email: "fictional-profile@example.test",
      },
    ],
  ]) {
    const base = "/admin/content-records/" + kind;
    check(
      (await call(base, { anonymous: true })).status === 401,
      kind + ": anonymous inventory denied",
    );
    const key = randomUUID(),
      body = { teamId: null, record },
      first = data(await write(base, body, "POST", key)).record;
    owned.push({ table, id: first.id });
    check(
      first.revision === 1 && !first.is_active,
      kind + ": creation remains a private draft",
    );
    check(
      data(await write(base, body, "POST", key)).record.id === first.id,
      kind + ": unchanged create retry returns the same record",
    );
    const path = base + "/" + first.id,
      selected = data(await call(path)).record;
    check(
      selected.actions.includes("update") && selected.revision === 1,
      kind + ": selected detail carries current action grants",
    );
    const revised = { ...record, order_index: 17 },
      updated = data(
        await write(
          path,
          { revision: 1, teamId: null, record: revised },
          "PATCH",
        ),
      ).record;
    check(
      updated.revision === 2 && !updated.is_active,
      kind + ": current edit increments revision without publication",
    );
    check(
      (await write(path, { revision: 1, record: revised }, "PATCH")).status ===
        409,
      kind + ": stale edit cannot overwrite the newer record",
    );
    const archived = data(
      await write(
        path,
        { revision: updated.revision, action: "archive" },
        "DELETE",
      ),
    ).record;
    check(
      !!archived.deleted_at && !archived.is_active,
      kind + ": archive preserves recoverable private history",
    );
    const restored = data(
      await write(path, { revision: archived.revision, action: "restore" }),
    ).record;
    check(
      !restored.deleted_at && !restored.is_active,
      kind + ": restore stays private",
    );
    data(
      await write(
        path,
        { revision: restored.revision, action: "archive" },
        "DELETE",
      ),
    );
  }
  checked(
    await db.from("admin_users").update({ is_active: false }).eq("id", actor),
  );
  check(
    (await call("/admin/content-records/resources")).status === 401,
    "deactivation revokes collection reads immediately",
  );
  completed = true;
} finally {
  for (const { table, id } of owned) {
    const row = checked(
      await db
        .from(table)
        .select("id,created_by,revision,deleted_at")
        .eq("id", id)
        .single(),
    );
    if (row.created_by !== actor)
      throw Error(
        "Collection fixture ownership changed; no user record modified.",
      );
    if (!row.deleted_at) {
      const rows = checked(
        await db
          .from(table)
          .update({
            is_active: false,
            deleted_at: new Date().toISOString(),
            revision: row.revision + 1,
          })
          .eq("id", id)
          .eq("revision", row.revision)
          .select("id"),
      );
      if (rows.length !== 1)
        throw Error(
          "Collection fixture revision changed; cleanup not confirmed.",
        );
    }
  }
  if (created) {
    checked(
      await db
        .from("admin_users")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .eq("id", actor),
    );
    checked(
      await db
        .from("admin_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("admin_user_id", actor)
        .is("revoked_at", null),
    );
  }
  await writeFile(
    new URL("../.docs/phase0/local-collection-recovery.json", import.meta.url),
    JSON.stringify(
      {
        note: "Actual loopback resource/sponsor/public-team recovery using a fresh fictional officer and three new private drafts. Existing content and roles untouched. Fixtures recoverably archived; account disabled/sessions revoked. No public publication, external provider, real file, email or quota/job reset.",
        completed,
        cleanup: { completed: true },
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
