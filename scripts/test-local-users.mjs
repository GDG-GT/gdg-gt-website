import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { decryptPayload } from "../server/lib/encryption.mjs";
import { tokenHash } from "../server/lib/security.mjs";
import { deliveryMessage, mailConfig } from "../server/delivery.mjs";
import { serverConfig } from "../server/config.mjs";
const { call, login, logout, db, env, credentials } = await localHttp(),
  evidence = [],
  fixtures = [];
function check(value, name) {
  if (!value) throw new Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS " + name);
}
const session = await login(),
  prefix = "/admin/users",
  suffix = randomUUID(),
  email = `fictional-account-${suffix}@example.test`,
  password = "Fictional-only-" + randomUUID();
async function change(user, action, extra = {}) {
  return call(prefix + "/" + user.id, {
    method: "POST",
    body: {
      currentPassword: credentials.password,
      confirmation: user.email,
      revision: user.revision,
      action,
      ...extra,
    },
  });
}
async function accessFor(id) {
  const result = await db
    .from("delivery_jobs")
    .select("*")
    .eq("kind", "account_access")
    .contains("payload", { userId: id })
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (result.error || !result.data.secret_payload)
    throw new Error(
      "Fixture access delivery unavailable; pause the local scheduler before this suite.",
    );
  return {
    job: result.data,
    ...decryptPayload(result.data.secret_payload, env.DATA_ENCRYPTION_KEY),
  };
}
function client() {
  const cookies = new Map();
  let csrf;
  return async (path, { method = "GET", body } = {}) => {
    const r = await fetch(env.APP_ORIGIN + "/api/v1" + path, {
      method,
      headers: {
        Origin: env.APP_ORIGIN,
        Cookie: [...cookies].map(([k, v]) => k + "=" + v).join("; "),
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    for (const c of r.headers.getSetCookie()) {
      const pair = c.split(";")[0],
        i = pair.indexOf("=");
      cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    const json = await r.json();
    if (json.data?.csrfToken) csrf = json.data.csrfToken;
    return { status: r.status, json };
  };
}
try {
  let r = await call(prefix, { anonymous: true });
  check(r.status === 401, "account directory rejects anonymous callers");
  r = await call(prefix, {
    method: "POST",
    body: {
      currentPassword: credentials.password,
      record: {
        email,
        display_name: "Fictional account",
        role: "team_member",
        password_hash: "forged",
      },
    },
  });
  check(
    r.status === 400,
    "account creation rejects password hash mass assignment",
  );
  r = await call(prefix, {
    method: "POST",
    body: {
      currentPassword: credentials.password,
      record: { email, display_name: "Fictional account", role: "team_member" },
    },
  });
  check(
    r.status === 200 &&
      r.json.data.accessQueued &&
      r.json.data.record.must_change_password &&
      !r.text.includes("token_hash") &&
      !r.text.includes("password_hash"),
    "new account requires setup without exposing credentials or raw capabilities",
  );
  let user = r.json.data.record;
  fixtures.push(user.id);
  const access = await accessFor(user.id),
    stored = await db
      .from("account_access_tokens")
      .select("token_hash")
      .eq("admin_user_id", user.id)
      .is("revoked_at", null)
      .single();
  check(
    stored.data.token_hash === tokenHash(access.token) &&
      !JSON.stringify(access.job.payload).includes(access.token),
    "setup capability is hashed with encrypted outbox payload",
  );
  const message = await deliveryMessage(
    access.job,
    db,
    serverConfig(env),
    mailConfig(env),
  );
  check(
    message.to === email &&
      message.text.includes("/account/setup#token=") &&
      !message.text.includes(password),
    "local setup email binds the recipient and keeps capability in a fragment",
  );
  r = await call("/account/setup", {
    anonymous: true,
    method: "POST",
    body: {
      token: access.token,
      email: "wrong@example.test",
      newPassword: password,
    },
  });
  check(r.status === 400, "setup rejects a different recipient email");
  r = await call("/account/setup", {
    anonymous: true,
    method: "POST",
    body: { token: access.token, email, newPassword: password },
  });
  check(
    r.status === 200 && r.json.data.completed,
    "recipient can choose their own password through the public API",
  );
  r = await call("/account/setup", {
    anonymous: true,
    method: "POST",
    body: { token: access.token, email, newPassword: password },
  });
  check(r.status === 400, "completed setup link cannot be replayed");
  user = (await call(prefix + "/" + user.id)).json.data.record;
  const member = client();
  await member("/auth/gate", {
    method: "POST",
    body: { code: credentials.gateCode },
  });
  r = await member("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  check(
    r.status === 200,
    "configured recipient signs in through the normal gate and password flow",
  );
  r = await member(prefix);
  check(r.status === 403, "team members cannot list chapter accounts");
  r = await call(prefix + "/" + user.id + "/sessions");
  check(
    r.status === 200 &&
      r.json.data.items.length === 1 &&
      !r.text.includes("token_hash"),
    "Super Admin can inspect session dates without bearer material",
  );
  r = await change(user, "deactivate", { confirmation: "wrong" });
  check(
    r.status === 400,
    "destructive account changes require typed identity confirmation",
  );
  r = await change(user, "deactivate", {
    currentPassword: "Definitely-wrong-password",
  });
  check(
    r.status === 403,
    "correct CSRF alone cannot authorize an account change",
  );
  r = await change(user, "deactivate");
  check(
    r.status === 200 && !r.json.data.record.is_active,
    "deactivation is applied atomically",
  );
  user = r.json.data.record;
  r = await member("/auth/session");
  check(
    r.status === 401,
    "deactivation blocks the very next existing-session request",
  );
  r = await change({ ...user, revision: user.revision - 1 }, "activate");
  check(
    r.status === 409,
    "stale account revisions cannot overwrite a newer state",
  );
  r = await change(user, "activate");
  check(
    r.status === 200 && r.json.data.record.is_active,
    "inactive accounts can be explicitly activated",
  );
  user = r.json.data.record;
  r = await change(user, "reset");
  check(
    r.status === 200 &&
      r.json.data.record.must_change_password &&
      r.json.data.accessQueued,
    "reset requires new password setup and queues one private link",
  );
  user = r.json.data.record;
  const reset = await accessFor(user.id);
  r = await change(user, "reset");
  check(r.status === 429, "setup resend has a persisted cooldown");
  r = await member("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  check(r.status === 401, "old password cannot sign in while reset is pending");
  r = await call("/account/setup", {
    anonymous: true,
    method: "POST",
    body: { token: reset.token, email, newPassword: password + "-new" },
  });
  check(r.status === 200, "fresh reset capability restores password access");
  user = (await call(prefix + "/" + user.id)).json.data.record;
  r = await call(prefix + "/" + user.id, {
    method: "PATCH",
    body: {
      currentPassword: credentials.password,
      revision: user.revision,
      record: {
        display_name: "Fictional revised account",
        role: "blog_editor",
      },
    },
  });
  check(
    r.status === 200 && r.json.data.record.role === "blog_editor",
    "role changes use the protected account mutation",
  );
  user = r.json.data.record;
  r = await call(prefix + "/" + session.user.id, {
    method: "PATCH",
    body: {
      currentPassword: credentials.password,
      revision: 1,
      record: { display_name: "Not allowed", role: "team_member" },
    },
  });
  check(r.status === 403, "self-role changes and self-lockout are rejected");
  const adminEmail = `fictional-admin-${suffix}@example.test`;
  r = await call(prefix, {
    method: "POST",
    body: {
      currentPassword: credentials.password,
      record: {
        email: adminEmail,
        display_name: "Fictional scoped administrator",
        role: "admin",
      },
    },
  });
  check(
    r.status === 200,
    "Super Admin can create an administrator with private setup",
  );
  const adminId = r.json.data.record.id;
  fixtures.push(adminId);
  const adminAccess = await accessFor(adminId);
  await call("/account/setup", {
    anonymous: true,
    method: "POST",
    body: {
      token: adminAccess.token,
      email: adminEmail,
      newPassword: password,
    },
  });
  const admin = client();
  await admin("/auth/gate", {
    method: "POST",
    body: { code: credentials.gateCode },
  });
  await admin("/auth/login", {
    method: "POST",
    body: { email: adminEmail, password },
  });
  r = await admin(prefix);
  check(r.status === 403, "Admin has no Super Admin directory route");
  r = await admin(prefix + "/" + session.user.id + "/sessions");
  check(r.status === 403, "Admin cannot inspect Super Admin sessions");
  r = await admin(prefix + "/" + user.id, {
    method: "PATCH",
    body: {
      currentPassword: password,
      revision: user.revision,
      record: { display_name: "Forbidden promotion", role: "super_admin" },
    },
  });
  check(
    r.status === 403,
    "Admin cannot promote a subordinate to a privileged role",
  );
  r = await admin(prefix + "/" + user.id, {
    method: "PATCH",
    body: {
      currentPassword: password,
      revision: user.revision,
      record: { display_name: "Fictional scoped edit", role: "team_member" },
    },
  });
  check(
    r.status === 200 && r.json.data.record.role === "team_member",
    "Admin may manage subordinate accounts through scoped API calls",
  );
  user = r.json.data.record;
  r = await change(user, "archive");
  check(
    r.status === 200 &&
      !!r.json.data.record.deleted_at &&
      !r.json.data.record.is_active,
    "archival preserves account history while revoking access",
  );
  user = r.json.data.record;
  r = await change(user, "restore");
  check(
    r.status === 200 &&
      !r.json.data.record.deleted_at &&
      !r.json.data.record.is_active,
    "restoration never silently activates an account",
  );
  r = await call(prefix + "?q=" + encodeURIComponent(email));
  check(
    r.status === 200 &&
      r.json.data.total === 1 &&
      !r.text.includes("password_hash"),
    "directory search returns only safe account projections",
  );
} finally {
  for (const id of fixtures) {
    const r = await call(prefix + "/" + id);
    if (r.status === 200 && !r.json.data.record.deleted_at) {
      const archived = await change(r.json.data.record, "archive");
      if (archived.status !== 200)
        throw new Error(
          "Fictional account cleanup requires attention: " + archived.status,
        );
    }
  }
  await logout();
}
await writeFile(
  new URL("../.docs/phase0/local-users-integration.json", import.meta.url),
  JSON.stringify(
    {
      note: "Real local account API, hashed capabilities, encrypted local-mail generation, current role hierarchy, session revocation. Only new fictional accounts used and recoverably archived; no credentials recorded.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
