import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
const { call, login, logout, db, env, credentials } = await localHttp(),
  evidence = [],
  rooms = [],
  accounts = [];
const suffix = randomUUID(),
  password = "Fictional-channel-only-" + suffix,
  hash = await hashSecret(password);
function check(value, name) {
  if (!value) throw new Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS " + name);
}
function client() {
  const cookies = new Map();
  let csrf;
  return async (path, { method = "GET", body, key } = {}) => {
    const r = await fetch(env.APP_ORIGIN + "/api/v1" + path, {
      method,
      headers: {
        Origin: env.APP_ORIGIN,
        Cookie: [...cookies].map(([k, v]) => k + "=" + v).join("; "),
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
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
      /* never log secret bodies */
    }
    if (json?.data?.csrfToken) csrf = json.data.csrfToken;
    return { status: r.status, json, text };
  };
}
async function seed(label, role = "team_member") {
  const u = {
    id: randomUUID(),
    email: `fictional-channel-${label}-${suffix}@example.test`,
    display_name: "Fictional " + label,
    password_hash: hash,
    role,
    is_active: true,
  };
  const r = await db.from("admin_users").insert(u);
  if (r.error) throw new Error("Fixture account failed");
  accounts.push(u.id);
  return u;
}
async function get(id) {
  const r = await call("/admin/channels/" + id);
  if (r.status !== 200) throw new Error("Fixture room unavailable " + r.status);
  return r.json.data.record;
}
async function change(c, action, document = {}) {
  return call("/admin/channels/" + c.id, {
    method: "POST",
    body: {
      currentPassword: credentials.password,
      revision: c.revision,
      action,
      ...document,
    },
  });
}
await login();
try {
  const member = await seed("member"),
    outsider = await seed("outsider"),
    editor = await seed("editor", "blog_editor"),
    memberClient = client(),
    outsiderClient = client(),
    editorClient = client();
  for (const [transport, u] of [
    [memberClient, member],
    [outsiderClient, outsider],
    [editorClient, editor],
  ]) {
    await transport("/auth/gate", {
      method: "POST",
      body: { code: credentials.gateCode },
    });
    const r = await transport("/auth/login", {
      method: "POST",
      body: { email: u.email, password },
    });
    if (r.status !== 200)
      throw new Error("Fictional channel login failed " + r.status);
  }
  let r = await call("/admin/channels", { anonymous: true });
  check(r.status === 401, "channel inventory rejects anonymous callers");
  r = await call("/admin/channels", {
    method: "POST",
    body: {
      currentPassword: credentials.password,
      record: { name: "Fictional private " + suffix },
    },
  });
  check(
    r.status === 200 && r.json.data.record.visibility === "private",
    "new room defaults to private with server-owned creator",
  );
  let room = r.json.data.record;
  rooms.push(room.id);
  const prefix = "/admin/channels/" + room.id;
  r = await outsiderClient(prefix);
  check(
    r.status === 404,
    "private room cannot be inferred by an unrelated active account",
  );
  r = await memberClient("/admin/channels");
  check(
    r.status === 200 && !r.json.data.items.some((c) => c.id === room.id),
    "private rooms are filtered before list counts and pagination",
  );
  r = await change(room, "member_add", { email: member.email, role: "member" });
  check(r.status === 200, "room owner adds explicit scoped membership");
  room = r.json.data.record;
  r = await memberClient(prefix);
  check(
    r.status === 200 && r.json.data.actions.send && !r.json.data.actions.manage,
    "ordinary room member can send but cannot administer the room",
  );
  r = await memberClient(prefix, {
    method: "PATCH",
    body: {
      currentPassword: password,
      revision: room.revision,
      record: { name: "Forbidden edit", description: "No room management" },
    },
  });
  check(
    r.status === 404,
    "room membership does not imply administrative edit permission",
  );
  r = await memberClient(prefix + "/messages", {
    method: "POST",
    body: { message: "Forged", sender_id: outsider.id },
    key: randomUUID(),
  });
  check(r.status === 400, "message input rejects sender mass assignment");
  const key = randomUUID(),
    message = "Fictional private message " + suffix;
  r = await memberClient(prefix + "/messages", {
    method: "POST",
    body: { message },
    key,
  });
  check(r.status === 200, "authorized member sends a real message");
  const id = r.json.data.id;
  r = await memberClient(prefix + "/messages", {
    method: "POST",
    body: { message },
    key,
  });
  check(
    r.status === 200 && r.json.data.id === id,
    "same send idempotency key never duplicates the message",
  );
  r = await memberClient(prefix + "/messages", {
    method: "POST",
    body: { message: "Changed payload" },
    key,
  });
  check(
    r.status === 409,
    "send idempotency key cannot be reused for another payload",
  );
  r = await outsiderClient(prefix + "/messages");
  check(
    r.status === 404,
    "private message history cannot be read by an outsider",
  );
  r = await call(prefix + "/messages/" + id, {
    method: "POST",
    body: {
      action: "edit",
      revision: 1,
      message: "Admin cannot silently rewrite another sender",
    },
  });
  check(
    r.status === 403,
    "moderation does not permit editing somebody else's message text",
  );
  r = await memberClient(prefix + "/messages/" + id, {
    method: "POST",
    body: { action: "pin", revision: 1, pinned: true },
  });
  check(r.status === 403, "ordinary member cannot pin messages");
  r = await call(prefix + "/messages/" + id, {
    method: "POST",
    body: { action: "pin", revision: 1, pinned: true },
  });
  check(r.status === 200, "authorized moderator can pin a message");
  r = await call(prefix + "/messages?pinned=1");
  check(
    r.status === 200 && r.json.data.items.some((m) => m.id === id),
    "pinned-message view uses the same room authorization",
  );
  r = await memberClient(prefix + "/messages/" + id, {
    method: "POST",
    body: { action: "edit", revision: 1, message: "Stale draft" },
  });
  check(
    r.status === 409,
    "stale message revisions cannot overwrite moderation changes",
  );
  r = await memberClient(prefix + "/messages/" + id, {
    method: "POST",
    body: { action: "edit", revision: 2, message: message + " edited" },
  });
  check(r.status === 200, "sender can edit their own current message");
  r = await call(prefix + "/messages", {
    method: "POST",
    body: { message: "Fictional reply", replyToId: id },
    key: randomUUID(),
  });
  check(r.status === 200, "same-room reply is linked to an authorized parent");
  r = await call("/admin/channels", {
    method: "POST",
    body: {
      currentPassword: credentials.password,
      record: { name: "Fictional internal " + suffix, visibility: "internal" },
    },
  });
  let internal = r.json.data.record;
  rooms.push(internal.id);
  r = await outsiderClient("/admin/channels/" + internal.id);
  check(
    r.status === 200 && !r.json.data.actions.manage,
    "internal room audience does not grant owner powers",
  );
  r = await memberClient("/admin/channels/" + internal.id + "/messages", {
    method: "POST",
    body: { message: "Invalid cross-room reply", replyToId: id },
    key: randomUUID(),
  });
  check(r.status === 409, "cross-channel reply targets are rejected");
  r = await memberClient(prefix + "/messages/" + id, {
    method: "POST",
    body: { action: "delete", revision: 3 },
  });
  check(r.status === 200, "sender can soft-delete their own message");
  r = await call(prefix + "/messages");
  check(
    r.status === 200 &&
      !r.text.includes(message) &&
      r.json.data.items.some(
        (m) => m.id === id && m.is_deleted && m.message === "",
      ),
    "deleted body is absent from messages and quoted reply previews",
  );
  const latest = r.json.data.items.at(-1);
  r = await memberClient(prefix + "/messages/" + latest.id, {
    method: "POST",
    body: { action: "read" },
  });
  check(
    r.status === 200,
    "read marker is bound to an actual authorized room message",
  );
  r = await memberClient("/admin/channels");
  check(
    r.status === 200 &&
      r.json.data.items.find((c) => c.id === room.id).unreadCount === 0,
    "read markers update room unread counts without trusting browser counters",
  );
  room = await get(room.id);
  r = await change(room, "member_add", { email: editor.email, role: "member" });
  check(
    r.status === 200,
    "explicit room membership can admit an editorial account without general chapter access",
  );
  room = r.json.data.record;
  r = await editorClient("/admin/access?route=/admin/channels");
  check(
    r.status === 200 && r.json.data.allowed,
    "editor channel route appears only after explicit room admission",
  );
  r = await editorClient("/admin/channels/" + internal.id);
  check(
    r.status === 404,
    "editor admission to one room does not expose internal chapter-wide rooms",
  );
  r = await change(room, "member_remove", {
    email: member.email,
    role: "member",
  });
  check(r.status === 200, "explicit private room membership can be revoked");
  room = r.json.data.record;
  r = await memberClient(prefix + "/messages");
  check(r.status === 404, "revocation blocks the next message-history request");
  r = await change(room, "archive", { confirmation: room.name });
  check(
    r.status === 200 && r.json.data.record.is_archived,
    "room archival preserves messages as a read-only workspace",
  );
  room = r.json.data.record;
  r = await call(prefix + "/messages", {
    method: "POST",
    body: { message: "No writes to archive" },
    key: randomUUID(),
  });
  check(
    r.status === 404,
    "even chapter administrators cannot send into an archived room",
  );
  r = await change(room, "restore", { confirmation: room.name });
  check(
    r.status === 200 &&
      !r.json.data.record.is_archived &&
      r.json.data.record.visibility === "private",
    "restoring a room does not widen its audience",
  );
} finally {
  for (const id of rooms) {
    const c = await get(id);
    if (!c.is_archived) {
      const r = await change(c, "archive", { confirmation: c.name });
      if (r.status !== 200)
        throw new Error("Fictional room cleanup failed " + r.status);
    }
  }
  for (const id of accounts) {
    const r = await db
      .from("admin_users")
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (r.error) throw new Error("Fictional channel account cleanup failed");
  }
  await logout();
}
await writeFile(
  new URL("../.docs/phase0/local-channels-integration.json", import.meta.url),
  JSON.stringify(
    {
      note: "Real local channels and independent member/outsider/editor sessions; private/internal audience, sender/moderator boundaries, replies, idempotency, tombstones, unread markers, revocation and archival. Only new fictional rooms/accounts used and recoverably archived. Realtime and attachments are not certified by this suite.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
