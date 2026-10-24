import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret, tokenHash } from "../server/lib/security.mjs";
import { decryptPayload } from "../server/lib/encryption.mjs";
import { runDelivery } from "../server/delivery.mjs";
const { call, login, logout, db, env, credentials } = await localHttp(),
  evidence = [],
  accounts = [];
const suffix = randomUUID(),
  password = "Fictional-invite-only-" + suffix,
  passwordHash = await hashSecret(password);
function check(value, name) {
  if (!value) throw new Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS " + name);
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
    const text = await r.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      /* no credentials are logged */
    }
    if (json?.data?.csrfToken) csrf = json.data.csrfToken;
    return { status: r.status, json, text };
  };
}
async function seed(label) {
  const record = {
    id: randomUUID(),
    email: `fictional-invite-${label}-${suffix}@example.test`,
    display_name: "Fictional " + label,
    password_hash: passwordHash,
    role: "team_member",
    is_active: true,
  };
  const r = await db.from("admin_users").insert(record);
  if (r.error) throw new Error("Fixture account creation failed");
  accounts.push(record.id);
  return record;
}
async function accessFor(id) {
  const result = await db
    .from("delivery_jobs")
    .select("*")
    .eq("kind", "team_invite")
    .contains("payload", { inviteId: id })
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (result.error || !result.data.secret_payload)
    throw new Error("Pause the local scheduler before invitation tests.");
  return {
    job: result.data,
    ...decryptPayload(result.data.secret_payload, env.DATA_ENCRYPTION_KEY),
  };
}
const user = (await login()).user;
let teamId;
try {
  let r = await call("/admin/teams", {
    method: "POST",
    body: {
      currentPassword: credentials.password,
      record: {
        name: "Fictional invitation team " + suffix,
        slug: "fictional-invitation-" + suffix,
        description: "Local fixture only",
        leadId: user.id,
      },
    },
  });
  check(
    r.status === 200,
    "invitation fixture team has a real active founding lead",
  );
  teamId = r.json.data.team.id;
  const prefix = `/admin/teams/${teamId}/invitations`,
    publicPrefix = "/account/team-invitations/",
    newEmail = `fictional-invite-new-${suffix}@example.test`;
  r = await call(prefix, { anonymous: true });
  check(r.status === 401, "invitation inventory is protected");
  r = await call(prefix, {
    method: "POST",
    body: {
      currentPassword: credentials.password,
      email: newEmail,
      role: "super_admin",
    },
  });
  check(r.status === 400, "invitations cannot assign chapter account roles");
  r = await call(prefix, {
    method: "POST",
    body: {
      currentPassword: credentials.password,
      email: newEmail,
      role: "member",
    },
  });
  check(
    r.status === 200 &&
      !r.text.includes("token_hash") &&
      !r.text.includes("secret_payload"),
    "invitation creates a safe status record without exposing its capability",
  );
  const invitation = r.json.data.record,
    access = await accessFor(invitation.id);
  r = await call(prefix, {
    method: "POST",
    body: {
      currentPassword: credentials.password,
      email: newEmail,
      role: "member",
    },
  });
  check(
    r.status === 200 && r.json.data.record.id === invitation.id,
    "duplicate pending recipient does not create a second invitation",
  );
  const jobs = await db
    .from("delivery_jobs")
    .select("id")
    .eq("kind", "team_invite")
    .contains("payload", { inviteId: invitation.id });
  check(
    jobs.data.length === 1 &&
      access.job.payload.tokenHash === tokenHash(access.token),
    "deduplicated invite outbox stores only hashed metadata and encrypted secrets",
  );
  await runDelivery({ db, env, limit: 100 });
  const delivered = await db
    .from("delivery_jobs")
    .select("state,secret_payload")
    .eq("id", access.job.id)
    .single();
  check(
    delivered.data.state === "completed" &&
      delivered.data.secret_payload === null,
    "local SMTP worker delivers the private link and clears encrypted outbox secrets",
  );
  r = await call(publicPrefix + "inspect", {
    anonymous: true,
    method: "POST",
    body: { token: access.token, email: "wrong@example.test" },
  });
  check(
    r.status === 400,
    "valid capability alone does not bypass invitation email binding",
  );
  r = await call(publicPrefix + "inspect", {
    anonymous: true,
    method: "POST",
    body: { token: access.token, email: newEmail },
  });
  check(
    r.status === 200 &&
      !r.json.data.requiresSignIn &&
      !!r.json.data.inviterName &&
      r.json.data.state === "pending" &&
      !r.text.includes("userId"),
    "new recipient can inspect only minimal valid invitation details",
  );
  const declineEmail = `fictional-invite-decline-${suffix}@example.test`;
  let decline = await call(prefix, {
    method: "POST",
    body: {
      currentPassword: credentials.password,
      email: declineEmail,
      role: "member",
    },
  });
  check(
    decline.status === 200,
    "decline fixture is a real manager-created invitation",
  );
  const declineAccess = await accessFor(decline.json.data.record.id);
  decline = await call(publicPrefix + "decline", {
    anonymous: true,
    method: "POST",
    body: { token: declineAccess.token, email: "wrong@example.test" },
  });
  check(decline.status === 400, "decline rejects the wrong recipient");
  decline = await call(publicPrefix + "decline", {
    anonymous: true,
    method: "POST",
    body: { token: declineAccess.token, email: declineEmail },
  });
  check(
    decline.status === 200 && decline.json.data.declined,
    "new recipient can decline without creating an account",
  );
  const declinedAccount = await db
    .from("admin_users")
    .select("id")
    .eq("email", declineEmail);
  check(
    !declinedAccount.error && declinedAccount.data.length === 0,
    "decline does not create a chapter identity",
  );
  decline = await call(publicPrefix + "inspect", {
    anonymous: true,
    method: "POST",
    body: { token: declineAccess.token, email: declineEmail },
  });
  check(decline.status === 400, "declined private link is no longer usable");
  r = await call(publicPrefix + "accept", {
    anonymous: true,
    method: "POST",
    body: {
      token: access.token,
      email: newEmail,
      displayName: "Fictional new invitee",
      newPassword: password,
    },
  });
  check(
    r.status === 200 && r.json.data.accepted && r.json.data.requiresSignIn,
    "new recipient creates an account without bypassing chapter sign-in",
  );
  const created = await db
    .from("admin_users")
    .select("id,role,password_hash")
    .eq("email", newEmail)
    .single();
  accounts.push(created.data.id);
  check(
    created.data.role === "team_member" &&
      created.data.password_hash.startsWith("scrypt$"),
    "new invited account has fixed Team Member role and a scrypt credential",
  );
  r = await call(publicPrefix + "accept", {
    anonymous: true,
    method: "POST",
    body: {
      token: access.token,
      email: newEmail,
      displayName: "Fictional replay",
      newPassword: password,
    },
  });
  check(r.status === 400, "accepted invitation cannot be replayed");
  const existing = await seed("existing"),
    existingClient = client();
  await existingClient("/auth/gate", {
    method: "POST",
    body: { code: credentials.gateCode },
  });
  await existingClient("/auth/login", {
    method: "POST",
    body: { email: existing.email, password },
  });
  r = await call(prefix, {
    method: "POST",
    body: {
      currentPassword: credentials.password,
      email: existing.email,
      role: "co_lead",
    },
  });
  const existingInvite = r.json.data.record,
    existingAccess = await accessFor(existingInvite.id);
  r = await call(publicPrefix + "accept", {
    anonymous: true,
    method: "POST",
    body: {
      token: existingAccess.token,
      email: existing.email,
      newPassword: password,
      displayName: "Attempted overwrite",
    },
  });
  check(
    r.status === 401,
    "existing-account invitations cannot take over credentials without sign-in",
  );
  r = await call(publicPrefix + "accept", {
    method: "POST",
    body: { token: existingAccess.token, email: existing.email },
  });
  check(
    r.status === 403,
    "a different signed-in account cannot accept the intended recipient's invitation",
  );
  r = await existingClient(publicPrefix + "accept", {
    method: "POST",
    body: { token: existingAccess.token, email: existing.email },
  });
  check(
    r.status === 200 && r.json.data.accepted,
    "intended existing account can accept with its current session and CSRF",
  );
  const unchanged = await db
    .from("admin_users")
    .select("role,password_hash")
    .eq("id", existing.id)
    .single();
  check(
    unchanged.data.role === "team_member" &&
      unchanged.data.password_hash === passwordHash,
    "existing acceptance does not change chapter role or password",
  );
  const rotateEmail = `fictional-invite-rotate-${suffix}@example.test`;
  r = await call(prefix, {
    method: "POST",
    body: {
      currentPassword: credentials.password,
      email: rotateEmail,
      role: "member",
    },
  });
  let rotate = r.json.data.record;
  const old = await accessFor(rotate.id);
  r = await call(prefix + "/" + rotate.id, {
    method: "POST",
    body: {
      currentPassword: credentials.password,
      revision: rotate.revision,
      action: "resend",
    },
  });
  check(r.status === 429, "persisted invitation resend cooldown is enforced");
  // Advance only this newly-created fixture's send timestamp; never reset quotas.
  await db
    .from("team_invites")
    .update({ last_sent_at: new Date(Date.now() - 61000).toISOString() })
    .eq("id", rotate.id);
  r = await call(prefix + "/" + rotate.id, {
    method: "POST",
    body: {
      currentPassword: credentials.password,
      revision: rotate.revision,
      action: "resend",
    },
  });
  check(r.status === 200, "resending rotates an eligible pending invitation");
  rotate = r.json.data.record;
  const rotated = await accessFor(rotate.id);
  r = await call(publicPrefix + "inspect", {
    anonymous: true,
    method: "POST",
    body: { token: old.token, email: rotateEmail },
  });
  check(
    r.status === 400,
    "previous invitation capability stops working after resend",
  );
  r = await call(publicPrefix + "inspect", {
    anonymous: true,
    method: "POST",
    body: { token: rotated.token, email: rotateEmail },
  });
  check(r.status === 200, "new invitation capability is usable after rotation");
  r = await call(prefix + "/" + rotate.id, {
    method: "POST",
    body: {
      currentPassword: credentials.password,
      revision: rotate.revision,
      action: "revoke",
    },
  });
  check(
    r.status === 200 && r.json.data.record.status === "cancelled",
    "revocation preserves the invitation status record",
  );
  r = await call(publicPrefix + "inspect", {
    anonymous: true,
    method: "POST",
    body: { token: rotated.token, email: rotateEmail },
  });
  check(r.status === 400, "revoked invitation is unusable immediately");
  const lead = await seed("lead"),
    leadClient = client();
  let workspace = (await call("/admin/teams/" + teamId)).json.data;
  r = await call("/admin/teams/" + teamId, {
    method: "POST",
    body: {
      currentPassword: credentials.password,
      revision: workspace.team.revision,
      action: "member_add",
      email: lead.email,
      role: "lead",
    },
  });
  check(r.status === 200, "secondary lead is scoped to the existing team");
  workspace = r.json.data;
  await leadClient("/auth/gate", {
    method: "POST",
    body: { code: credentials.gateCode },
  });
  await leadClient("/auth/login", {
    method: "POST",
    body: { email: lead.email, password },
  });
  const leadEmail = `fictional-invite-scoped-${suffix}@example.test`;
  r = await leadClient(prefix, {
    method: "POST",
    body: { currentPassword: password, email: leadEmail, role: "lead" },
  });
  check(
    r.status === 403,
    "lead cannot invite a new officer or broaden chapter access",
  );
  r = await leadClient(prefix, {
    method: "POST",
    body: { currentPassword: password, email: leadEmail, role: "member" },
  });
  check(
    r.status === 200,
    "lead can invite a fixed-role member within their team",
  );
  const scoped = await accessFor(r.json.data.record.id),
    membership = workspace.members.find((m) => m.admin_user_id === lead.id);
  r = await call("/admin/teams/" + teamId, {
    method: "POST",
    body: {
      currentPassword: credentials.password,
      revision: workspace.team.revision,
      action: "member_remove",
      membershipId: membership.id,
      membershipRevision: membership.revision,
      role: "member",
    },
  });
  check(r.status === 200, "chapter administrator can remove a non-final lead");
  r = await call(publicPrefix + "inspect", {
    anonymous: true,
    method: "POST",
    body: { token: scoped.token, email: leadEmail },
  });
  check(
    r.status === 400,
    "invitation loses validity when its inviter loses team authority",
  );
  r = await call(prefix);
  check(
    r.status === 200 &&
      r.json.data.items.some((i) => i.status === "accepted") &&
      !r.text.includes("token_hash"),
    "manager status inventory shows outcomes but never raw or hashed capabilities",
  );
} finally {
  if (teamId) {
    const w = await call("/admin/teams/" + teamId);
    if (w.status === 200 && !w.json.data.team.deleted_at) {
      const r = await call("/admin/teams/" + teamId, {
        method: "POST",
        body: {
          currentPassword: credentials.password,
          revision: w.json.data.team.revision,
          action: "archive",
          confirmation: w.json.data.team.name,
        },
      });
      if (r.status !== 200)
        throw new Error("Fictional invitation team cleanup failed");
    }
  }
  for (const id of accounts) {
    const r = await db
      .from("admin_users")
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (r.error) throw new Error("Fictional invitation account cleanup failed");
  }
  await logout();
}
await writeFile(
  new URL(
    "../.docs/phase0/local-team-invitations-integration.json",
    import.meta.url,
  ),
  JSON.stringify(
    {
      note: "Real local invitation API, independent existing/lead sessions, actual local SMTP delivery, single-use/email/authority binding, fixed-role new account creation. All new fictional teams/accounts archived. Only fixture send timestamp advanced for resend cooldown; no quotas reset.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
