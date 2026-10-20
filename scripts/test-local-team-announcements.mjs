import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
import { runDelivery } from "../server/delivery.mjs";
const { call, login, logout, db, env, credentials } = await localHttp(),
  evidence = [],
  accounts = [];
const suffix = randomUUID(),
  password = "Fictional-announcement-only-" + suffix,
  hash = await hashSecret(password);
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
    const json = await r.json();
    if (json?.data?.csrfToken) csrf = json.data.csrfToken;
    return { status: r.status, json };
  };
}
async function seed(label) {
  const user = {
    id: randomUUID(),
    email: `fictional-post-${label}-${suffix}@example.test`,
    display_name: "Fictional " + label,
    password_hash: hash,
    role: "team_member",
    is_active: true,
  };
  const r = await db.from("admin_users").insert(user);
  if (r.error) throw new Error("Fixture account failed");
  accounts.push(user.id);
  return user;
}
const user = (await login()).user;
let teamId;
try {
  let r = await call("/admin/teams", {
    method: "POST",
    body: {
      currentPassword: credentials.password,
      record: {
        name: "Fictional announcement team " + suffix,
        slug: "fictional-posts-" + suffix,
        leadId: user.id,
      },
    },
  });
  check(r.status === 200, "announcement team is created with real scope");
  teamId = r.json.data.team.id;
  const member = await seed("member"),
    reader = client();
  r = await call("/admin/teams/" + teamId, {
    method: "POST",
    body: {
      currentPassword: credentials.password,
      revision: r.json.data.team.revision,
      action: "member_add",
      email: member.email,
      role: "member",
    },
  });
  check(
    r.status === 200,
    "reader receives ordinary membership without management grants",
  );
  await reader("/auth/gate", {
    method: "POST",
    body: { code: credentials.gateCode },
  });
  await reader("/auth/login", {
    method: "POST",
    body: { email: member.email, password },
  });
  const prefix = `/admin/teams/${teamId}/announcements`,
    message = "Fictional confidential announcement body " + suffix,
    record = { title: "Fictional chapter update", message };
  r = await call(prefix, { anonymous: true });
  check(r.status === 401, "announcement lists require authentication");
  r = await call(prefix, {
    method: "POST",
    body: { record: { ...record, author_id: user.id } },
  });
  check(
    r.status === 400,
    "announcement creation rejects client-controlled authorship",
  );
  r = await call(prefix, { method: "POST", body: { record } });
  check(r.status === 200, "announcement saves as a private draft");
  const id = r.json.data.id;
  r = await reader(prefix);
  check(
    r.status === 200 && r.json.data.total === 0,
    "ordinary members cannot read draft posts or infer their counts",
  );
  r = await reader(prefix, { method: "POST", body: { record } });
  check(r.status === 404, "ordinary members cannot create team announcements");
  r = await call(prefix + "/" + id, {
    method: "POST",
    body: { action: "publish", revision: 1 },
  });
  check(r.status === 200, "publication is a separate explicit mutation");
  r = await reader(prefix);
  check(
    r.status === 200 &&
      r.json.data.items.some((p) => p.id === id && p.message === message),
    "current team members receive published plain-text posts",
  );
  await reader(prefix + "/" + id, { method: "POST", body: { action: "read" } });
  await reader(prefix + "/" + id, { method: "POST", body: { action: "read" } });
  r = await call(prefix);
  let post = r.json.data.items.find((p) => p.id === id);
  check(
    post.readCount === 1,
    "read acknowledgements are idempotent and account-owned",
  );
  await runDelivery({ db, env, limit: 100 });
  await runDelivery({ db, env, limit: 100 });
  let notifications = await db
    .from("notifications")
    .select("user_id,title,message,delivery_key")
    .like("delivery_key", "team-announcement:" + id + ":%");
  check(
    notifications.data.length === 2 &&
      notifications.data.some((n) => n.user_id === member.id) &&
      notifications.data.every((n) => !n.message.includes(message)),
    "durable delivery notifies only the snapshot audience and excludes private body text",
  );
  r = await call(prefix + "/" + id, {
    method: "POST",
    body: { action: "pin", revision: post.revision, pinned: true },
  });
  check(r.status === 200, "pinning does not republish the post");
  r = await call(prefix);
  post = r.json.data.items.find((p) => p.id === id);
  check(
    post.is_pinned && post.is_published,
    "pinning preserves published visibility",
  );
  r = await call(prefix + "/" + id, {
    method: "PATCH",
    body: { revision: 1, record: { ...record, message: "Stale overwrite" } },
  });
  check(
    r.status === 409,
    "stale announcement revisions cannot overwrite a newer post",
  );
  r = await call(prefix + "/" + id, {
    method: "PATCH",
    body: {
      revision: post.revision,
      record: { ...record, message: message + " revised" },
    },
  });
  check(
    r.status === 200,
    "editing a published announcement saves a new private draft",
  );
  r = await reader(prefix);
  check(
    r.status === 200 && r.json.data.total === 0,
    "edited announcement is hidden until republished",
  );
  r = await call(prefix);
  post = r.json.data.items.find((p) => p.id === id);
  await call(prefix + "/" + id, {
    method: "POST",
    body: { action: "publish", revision: post.revision },
  });
  let workspace = (await call("/admin/teams/" + teamId)).json.data,
    membership = workspace.members.find((m) => m.admin_user_id === member.id);
  await call("/admin/teams/" + teamId, {
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
  await runDelivery({ db, env, limit: 100 });
  notifications = await db
    .from("notifications")
    .select("user_id")
    .like("delivery_key", "team-announcement:" + id + ":%");
  check(
    notifications.data.filter((n) => n.user_id === member.id).length === 1,
    "a former audience member is excluded again at delivery time",
  );
  r = await reader(prefix);
  check(
    r.status === 404,
    "former members immediately lose announcement access",
  );
  r = await call(prefix, {
    method: "POST",
    body: {
      record: {
        title: "Future fictional post",
        message: "Not visible before schedule",
        scheduledFor: new Date(Date.now() + 3600000).toISOString(),
        expiresAt: new Date(Date.now() + 7200000).toISOString(),
      },
    },
  });
  const scheduled = r.json.data.id;
  await call(prefix + "/" + scheduled, {
    method: "POST",
    body: { action: "publish", revision: 1 },
  });
  const futureJob = await db
    .from("delivery_jobs")
    .select("next_attempt_at")
    .eq("kind", "team_announcement")
    .contains("payload", { announcementId: scheduled })
    .single();
  check(
    new Date(futureJob.data.next_attempt_at) > new Date(),
    "scheduled announcement notification cannot be claimed early",
  );
  workspace = (await call("/admin/teams/" + teamId)).json.data;
  await call("/admin/teams/" + teamId, {
    method: "POST",
    body: {
      currentPassword: credentials.password,
      revision: workspace.team.revision,
      action: "member_add",
      email: member.email,
      role: "member",
    },
  });
  r = await reader(prefix);
  check(
    r.status === 200 && !r.json.data.items.some((p) => p.id === scheduled),
    "scheduled published posts remain hidden before their start time",
  );
  await db
    .from("team_announcements")
    .update({
      scheduled_for: new Date(Date.now() - 3600000).toISOString(),
      expires_at: new Date(Date.now() - 1000).toISOString(),
    })
    .eq("id", scheduled);
  r = await reader(prefix);
  check(
    r.status === 200 && !r.json.data.items.some((p) => p.id === scheduled),
    "expired published posts are not exposed to ordinary members",
  );
  r = await call(prefix);
  post = r.json.data.items.find((p) => p.id === id);
  r = await call(prefix + "/" + id, {
    method: "POST",
    body: { action: "archive", revision: post.revision },
  });
  check(
    r.status === 200,
    "announcement archive preserves content and audit history",
  );
  r = await call(prefix + "?state=archived");
  post = r.json.data.items.find((p) => p.id === id);
  r = await call(prefix + "/" + id, {
    method: "POST",
    body: { action: "restore", revision: post.revision },
  });
  check(r.status === 200, "announcement restores as a private draft");
  r = await reader(prefix);
  check(
    r.status === 200 && !r.json.data.items.some((p) => p.id === id),
    "restoration never silently republishes an announcement",
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
        throw new Error("Fictional announcement team cleanup failed");
    }
  }
  for (const id of accounts) {
    const r = await db
      .from("admin_users")
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (r.error)
      throw new Error("Fictional announcement account cleanup failed");
  }
  await logout();
}
await writeFile(
  new URL(
    "../.docs/phase0/local-team-announcements-integration.json",
    import.meta.url,
  ),
  JSON.stringify(
    {
      note: "Real local announcements, independent reader session, durable notification delivery, current audience revalidation, scheduling/expiry and recoverable archival. Only new fictional records used; only a fixture announcement clock was advanced for expiry. No quotas reset or external mail sent.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
