import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
const { call, login, logout, db, env, credentials } = await localHttp(),
  evidence = [],
  teams = [],
  accounts = [];
function check(value, name) {
  if (!value) throw new Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS " + name);
}
const suffix = randomUUID(),
  password = "Fictional-test-only-" + suffix,
  passwordHash = await hashSecret(password);
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
      /* diagnostic body is never logged */
    }
    if (json?.data?.csrfToken) csrf = json.data.csrfToken;
    return { status: r.status, json, text };
  };
}
const prefix = "/admin/teams";
async function get(id) {
  const r = await call(prefix + "/" + id);
  if (r.status !== 200) throw new Error("Fixture team unavailable " + r.status);
  return r.json.data;
}
async function change(
  w,
  action,
  document = {},
  transport = call,
  secret = credentials.password,
) {
  return transport(prefix + "/" + w.team.id, {
    method: "POST",
    body: {
      action,
      revision: w.team.revision,
      currentPassword: secret,
      ...document,
    },
  });
}
async function seed(label) {
  const record = {
    id: randomUUID(),
    email: `fictional-team-${label}-${suffix}@example.test`,
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
await login();
try {
  const lead = await seed("lead"),
    member = await seed("member"),
    outsider = await seed("outsider");
  let r = await call(prefix, { anonymous: true });
  check(r.status === 401, "team inventory rejects anonymous callers");
  r = await call(prefix, {
    method: "POST",
    body: {
      currentPassword: credentials.password,
      record: {
        name: "Fictional source " + suffix,
        slug: "fictional-source-" + suffix,
        description: "Local integration only",
        leadId: lead.id,
      },
    },
  });
  check(
    r.status === 200 && r.json.data.statistics.activeMembers === 1,
    "team creation assigns a real founding lead without default grants",
  );
  let source = r.json.data;
  teams.push(source.team.id);
  r = await call(prefix, {
    method: "POST",
    body: {
      currentPassword: credentials.password,
      record: {
        name: "Fictional destination " + suffix,
        slug: "fictional-dest-" + suffix,
        description: "Local integration only",
        leadId: outsider.id,
      },
    },
  });
  check(r.status === 200, "second team is independently scoped");
  let dest = r.json.data;
  teams.push(dest.team.id);
  const leadClient = client(),
    memberClient = client(),
    outsiderClient = client();
  for (const [transport, user] of [
    [leadClient, lead],
    [memberClient, member],
    [outsiderClient, outsider],
  ]) {
    await transport("/auth/gate", {
      method: "POST",
      body: { code: credentials.gateCode },
    });
    const signed = await transport("/auth/login", {
      method: "POST",
      body: { email: user.email, password },
    });
    if (signed.status !== 200)
      throw new Error("Fictional login unavailable " + signed.status);
  }
  r = await leadClient(prefix);
  check(
    r.status === 200 &&
      r.json.data.total === 1 &&
      r.json.data.items[0].id === source.team.id,
    "lead team listing filters unrelated teams before counts and paging",
  );
  r = await outsiderClient(prefix + "/" + source.team.id);
  check(
    r.status === 404,
    "unrelated members cannot infer a private team workspace",
  );
  r = await leadClient("/admin/access?route=/admin/teams");
  check(
    r.status === 200 && r.json.data.allowed,
    "active team members receive the own-team directory route",
  );
  r = await change(
    source,
    "member_add",
    { email: member.email, role: "member" },
    leadClient,
    password,
  );
  check(
    r.status === 200 && r.json.data.statistics.activeMembers === 2,
    "lead can add an existing active member only within their team",
  );
  source = r.json.data;
  r = await change(
    { ...source, team: { ...source.team, revision: source.team.revision - 1 } },
    "member_add",
    { email: member.email, role: "member" },
  );
  check(
    r.status === 409,
    "stale team revisions cannot overwrite membership changes",
  );
  let membership = source.members.find((m) => m.admin_user_id === member.id),
    leadMembership = source.members.find((m) => m.admin_user_id === lead.id);
  r = await change(
    source,
    "member_role",
    {
      membershipId: membership.id,
      membershipRevision: membership.revision,
      role: "lead",
    },
    leadClient,
    password,
  );
  check(r.status === 403, "lead cannot elevate another member to an officer");
  r = await change(source, "member_remove", {
    membershipId: leadMembership.id,
    membershipRevision: leadMembership.revision,
    role: "member",
  });
  check(
    r.status === 409 && r.json.error.code === "LAST_TEAM_LEAD",
    "final active lead cannot be removed",
  );
  r = await memberClient(prefix + "/" + source.team.id);
  const leadAccount = (await call("/admin/users/" + lead.id)).json.data.record;
  const blockedDeactivation = await call("/admin/users/" + lead.id, {
    method: "POST",
    body: {
      currentPassword: credentials.password,
      revision: leadAccount.revision,
      action: "deactivate",
      confirmation: lead.email,
    },
  });
  check(
    blockedDeactivation.status === 409 &&
      blockedDeactivation.json.error.code === "LAST_TEAM_LEAD",
    "account administration cannot disable the team's only active lead",
  );
  check(
    r.status === 200 &&
      r.json.data.members.every((m) => m.user.email === null) &&
      !r.json.data.actions.manage,
    "ordinary members see names but not private email or management affordances",
  );
  r = await change(
    source,
    "permissions",
    { confirmation: source.team.name, grants: [] },
    leadClient,
    password,
  );
  check(
    r.status === 404,
    "team leads cannot grant page or resource permissions",
  );
  r = await change(source, "permissions", {
    confirmation: source.team.name,
    grants: [
      {
        path: "/admin/users",
        resource: "admin_users",
        create: true,
        read: true,
        update: true,
        delete: true,
        extras: [],
      },
    ],
  });
  check(
    r.status === 400,
    "team grant API refuses security-critical account pages",
  );
  r = await change(source, "permissions", {
    confirmation: source.team.name,
    grants: [
      {
        path: "/admin/resources",
        resource: "resources",
        create: false,
        read: true,
        update: false,
        delete: false,
        extras: [],
      },
    ],
  });
  check(
    r.status === 200,
    "chapter administrator can explicitly grant a page and read action",
  );
  source = r.json.data;
  r = await memberClient("/admin/access?route=/admin/resources");
  check(
    r.status === 200 && r.json.data.allowed,
    "new request reflects a newly granted page without another sign-in",
  );
  r = await memberClient("/admin/content-records/resources", {
    method: "POST",
    body: {
      teamId: source.team.id,
      record: {
        title: "Forbidden fictional resource",
        description: "No create action granted",
        type: "documentation",
      },
    },
  });
  check(r.status === 403, "page visibility does not imply create permission");
  r = await change(source, "member_transfer", {
    membershipId: membership.id,
    membershipRevision: membership.revision,
    destinationId: dest.team.id,
    reason: "Fictional team transfer for integration verification",
  });
  check(
    r.status === 200 &&
      r.json.data.members.some((m) => m.id === membership.id && !m.is_active),
    "transfer preserves inactive source membership history",
  );
  source = r.json.data;
  dest = await get(dest.team.id);
  check(
    dest.members.some(
      (m) =>
        m.admin_user_id === member.id && m.is_active && m.role === "member",
    ),
    "transfer creates only member-level destination access",
  );
  r = await memberClient("/admin/access?route=/admin/resources");
  check(
    r.status === 200 && !r.json.data.allowed,
    "transferred member loses source grants on the next request",
  );
  r = await memberClient(prefix + "/" + source.team.id);
  check(
    r.status === 404,
    "former member cannot read their previous team workspace",
  );
  r = await call(prefix + "/" + source.team.id + "/transfers");
  check(
    r.status === 200 && r.json.data.total === 1,
    "transfer ledger records the committed movement",
  );
  r = await call(prefix + "/" + source.team.id + "/activity");
  check(
    r.status === 200 &&
      r.json.data.items.some((a) => a.action === "member_transfer"),
    "team activity contains transactional membership events",
  );
  r = await change(source, "archive", { confirmation: "wrong team" });
  check(r.status === 400, "team archive requires the exact team name");
  r = await change(source, "archive", { confirmation: source.team.name });
  check(
    r.status === 200 && !!r.json.data.team.deleted_at,
    "team archival is recoverable and preserves history",
  );
  source = r.json.data;
  r = await leadClient(prefix + "/" + source.team.id);
  check(
    r.status === 404,
    "archived teams are unavailable to former active members",
  );
  r = await change(source, "restore", { confirmation: source.team.name });
  check(
    r.status === 200 &&
      !r.json.data.team.deleted_at &&
      r.json.data.pages.every((p) => !p.can_access),
    "team restoration never silently restores old page grants",
  );
  source = r.json.data;
  r = await call(
    prefix +
      "/" +
      source.team.id +
      "/candidates?email=" +
      encodeURIComponent(member.email),
  );
  check(
    r.status === 200 &&
      r.json.data.items[0].id === member.id &&
      !r.text.includes("password_hash"),
    "administrator exact-email lookup returns minimal eligible account fields",
  );
} finally {
  for (const id of teams) {
    const w = await get(id);
    if (!w.team.deleted_at) {
      const r = await change(w, "archive", { confirmation: w.team.name });
      if (r.status !== 200)
        throw new Error(
          "Fictional team cleanup requires attention " + r.status,
        );
    }
  }
  // Dedicated new fixture accounts only; preserve their history and revoke bearer sessions.
  for (const id of accounts) {
    const r = await db
      .from("admin_users")
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (r.error) throw new Error("Fictional account cleanup failed");
  }
  await logout();
}
await writeFile(
  new URL("../.docs/phase0/local-teams-integration.json", import.meta.url),
  JSON.stringify(
    {
      note: "Real local team API/roles, independent user sessions, current page/action grants, membership transfers, archival/restore. Only newly created fictional teams/accounts used, then recoverably archived.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
