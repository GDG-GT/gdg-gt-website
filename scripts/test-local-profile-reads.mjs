import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { randomUUID } from "node:crypto";
import { hashSecret } from "../server/lib/security.mjs";
const h = await localHttp(),
  tests = [],
  actor = randomUUID(),
  email = "fictional-profile-reads-" + actor + "@example.test",
  password = "Fictional-profile-" + randomUUID();
const check = (ok, name) => {
  assert.ok(ok, name);
  tests.push({ name, passed: true });
  console.info("PASS " + name);
};
let signedIn = false,
  created = false,
  completed = false,
  logoutConfirmed = false;
try {
  for (const path of ["/admin/me/sessions", "/admin/me/activity"])
    check(
      (await h.call(path, { anonymous: true })).status === 401,
      path + " rejects anonymous reads",
    );
  const fixture = await h.db
    .from("admin_users")
    .insert({
      id: actor,
      email,
      display_name: "Fictional profile read reviewer",
      password_hash: await hashSecret(password),
      role: "admin",
      is_active: true,
    });
  if (fixture.error) throw Error("Profile fixture creation failed");
  created = true;
  const gate = await h.call("/auth/gate", {
    method: "POST",
    body: { code: h.credentials.gateCode },
  });
  assert.equal(gate.status, 200, "Local gate available");
  const login = await h.call("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(login.status, 200, "Fictional profile account signs in");
  signedIn = true;
  const sessions = await h.call("/admin/me/sessions");
  check(
    sessions.status === 200 &&
      sessions.json.data.items.some((row) => row.current),
    "current local sign-in is represented in the session inventory",
  );
  check(
    sessions.headers.get("cache-control")?.includes("no-store") &&
      sessions.json.data.items.every((row) =>
        Object.keys(row).every((key) =>
          [
            "id",
            "created_at",
            "last_seen_at",
            "idle_expires_at",
            "absolute_expires_at",
            "current",
          ].includes(key),
        ),
      ),
    "session inventory is uncached and contains no token or risk metadata",
  );
  const activity = await h.call("/admin/me/activity");
  check(
    activity.status === 200 && Array.isArray(activity.json.data.items),
    "own activity loads independently through the actual local API",
  );
  check(
    activity.headers.get("cache-control")?.includes("no-store") &&
      activity.json.data.items.every((row) =>
        Object.keys(row).every((key) =>
          [
            "id",
            "action",
            "target_type",
            "result",
            "created_at",
            "request_id",
          ].includes(key),
        ),
      ),
    "activity projection excludes raw audit metadata, identity and payloads",
  );
  completed = true;
} finally {
  if (signedIn) {
    await h.logout(true);
    logoutConfirmed = (await h.call("/admin/me/sessions")).status === 401;
    check(
      logoutConfirmed,
      "the probe's own session is revoked after read verification",
    );
  }
  if (created) {
    const disabled = await h.db
      .from("admin_users")
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq("id", actor);
    const revoked = await h.db
      .from("admin_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("admin_user_id", actor)
      .is("revoked_at", null);
    if (disabled.error || revoked.error)
      throw Error("Profile fixture cleanup not confirmed");
  }
  await writeFile(
    new URL("../.docs/phase0/local-profile-reads.json", import.meta.url),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note: "Actual loopback session/activity reads using a fresh fictional account, disabled and sessions revoked after verification. Existing accounts and settings untouched. No mail, provider or other-session changes. Response bodies and identity are not retained.",
        completed,
        cleanup: { logoutConfirmed },
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
