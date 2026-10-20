import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret, riskHash } from "../server/lib/security.mjs";
if (process.argv.includes("--hold-for-browser") && !process.stdin.isTTY)
  throw new Error("Browser review requires an interactive terminal.");
const { call, login, logout, db, credentials, env } = await localHttp(),
  evidence = [],
  boards = [],
  accounts = [];
const socketClients = [],
  socketChannels = [];
async function join(dto, topic, received = []) {
  const client = createClient(dto.url, dto.key, {
    accessToken: async () => dto.token,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: { timeout: 6000 },
  });
  socketClients.push(client);
  await client.realtime.setAuth(dto.token);
  let settle;
  const first = new Promise((resolve) => {
    settle = resolve;
  });
  const channel = client
    .channel(topic, { config: { private: true } })
    .on("broadcast", { event: "changed" }, ({ payload }) =>
      received.push(payload),
    )
    .subscribe((status) => {
      if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT"].includes(status))
        settle(status);
    });
  socketChannels.push(channel);
  const timeout = new Promise((resolve) => {
    setTimeout(() => resolve("TEST_TIMEOUT"), 8000).unref();
  });
  return Promise.race([first, timeout]);
}
async function verifySocket(id, viewer) {
  let r = await call("/auth/realtime-token", {
    method: "POST",
    body: { kind: "whiteboard", id },
  });
  check(
    r.status === 200 && r.json.data.topic === "gdg:whiteboard:" + id,
    "protected issuance produces an exact whiteboard socket scope",
  );
  const dto = r.json.data,
    received = [];
  check(
    (await join(dto, dto.topic, received)) === "SUBSCRIBED",
    "actual private whiteboard WebSocket authorizes the scoped board",
  );
  check(
    (await join(dto, "gdg:whiteboard:" + randomUUID())) === "CHANNEL_ERROR",
    "whiteboard JWT cannot subscribe to a different board",
  );
  const current = (await get(id)).record;
  r = await change(current, "save", {
    document: { ...scene, elements: [rectangle("socket-verification", 200)] },
  });
  check(
    r.status === 200,
    "socket review mutation still uses protected HTTP saving",
  );
  const until = Date.now() + 5000;
  while (!received.length && Date.now() < until)
    await new Promise((resolve) => setTimeout(resolve, 30));
  check(
    received.length > 0 &&
      received.every(
        (p) =>
          p.kind === "whiteboard" &&
          p.id === id &&
          Object.keys(p).every((k) => ["kind", "id"].includes(k)),
      ),
    "actual drawing broadcast contains only board invalidation metadata, never scene content",
  );
  const direct = await fetch(dto.url + "/rest/v1/whiteboards?select=id", {
    headers: { apikey: dto.key, Authorization: "Bearer " + dto.token },
  });
  check(
    direct.status === 403,
    "whiteboard socket token cannot read application records over PostgREST",
  );
  r = await viewer("/auth/realtime-token", {
    method: "POST",
    body: { kind: "whiteboard", id },
  });
  check(
    r.status === 404,
    "removed collaborator cannot mint a replacement whiteboard socket token",
  );
}
const suffix = randomUUID(),
  password = "Fictional-board-only-" + suffix,
  hash = await hashSecret(password);
function check(value, name) {
  if (!value) throw new Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS " + name);
}
async function fixture(label, role = "team_member") {
  const id = randomUUID(),
    email = `fictional-board-${label}-${suffix}@example.test`;
  const seeded = await db.from("admin_users").insert({
    id,
    email,
    display_name: "Fictional " + label,
    password_hash: hash,
    role,
    is_active: true,
  });
  if (seeded.error) throw new Error("Fixture account unavailable");
  accounts.push(id);
  const transport = await localHttp();
  await transport.call("/auth/gate", {
    method: "POST",
    body: { code: credentials.gateCode },
  });
  const r = await transport.call("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  if (r.status !== 200)
    throw new Error("Fixture sign-in unavailable " + r.status);
  return { id, email, call: transport.call };
}
const rectangle = (id = "fictional-rectangle", x = 40) => ({
  id,
  type: "rectangle",
  x,
  y: 50,
  width: 180,
  height: 100,
  angle: 0,
  strokeColor: "#a84334",
  backgroundColor: "#f7e3dd",
  strokeWidth: 2,
  opacity: 100,
  roughness: 1,
});
const scene = {
  elements: [rectangle()],
  appState: { viewBackgroundColor: "#f2f3f5" },
};
const base = (r) => ({ version: r.version, updatedAt: r.updated_at });
async function get(id, transport = call) {
  const r = await transport("/admin/whiteboards/" + id);
  if (r.status !== 200)
    throw new Error("Fixture board unavailable " + r.status);
  return r.json.data;
}
async function change(
  record,
  action,
  extra = {},
  transport = call,
  key = randomUUID(),
) {
  return transport("/admin/whiteboards/" + record.id, {
    method: "POST",
    key,
    body: { action, ...base(record), ...extra },
  });
}
// This suite needs four confirmations. Check available headroom without taking
// a login, resetting a limit, changing policy, or creating disposable records.
const actor = await db
  .from("admin_users")
  .select("id")
  .eq("email", credentials.email)
  .single();
if (actor.error) throw new Error("Local review account unavailable");
const headroom = await db.rpc("check_rate_limit", {
  p_scope: "whiteboards.confirm",
  p_risk_hash: riskHash(actor.data.id, env.RISK_HASH_SECRET),
  p_limit: 2,
});
if (headroom.error) throw new Error("Confirmation quota preflight unavailable");
if (!headroom.data.allowed)
  throw new Error(
    "Wait for the existing confirmation cooldown before rerunning this suite (approximately " +
      headroom.data.retryAfter +
      " seconds). No limit was reset and no records were created.",
  );
await login();
try {
  const viewer = await fixture("viewer"),
    editor = await fixture("editor", "blog_editor"),
    outsider = await fixture("outsider");
  let r = await call("/admin/whiteboards", { anonymous: true });
  check(r.status === 401, "whiteboard inventory rejects anonymous callers");
  const createKey = randomUUID(),
    createBody = {
      name: "Fictional whiteboard verification " + suffix.slice(0, 8),
    };
  r = await call("/admin/whiteboards", {
    method: "POST",
    body: createBody,
    key: createKey,
  });
  check(
    r.status === 200 &&
      r.json.data.record.team_id === null &&
      !Object.hasOwn(r.json.data.record, "document"),
    "new board is private with a minimal metadata projection",
  );
  let record = r.json.data.record;
  boards.push(record.id);
  r = await call("/admin/whiteboards", {
    method: "POST",
    body: createBody,
    key: createKey,
  });
  check(
    r.status === 200 && r.json.data.record.id === record.id,
    "duplicate create retry does not create another board",
  );
  r = await call("/admin/whiteboards", {
    method: "POST",
    key: randomUUID(),
    body: { ...createBody, created_by: outsider.id },
  });
  check(r.status === 400, "creator identity cannot be supplied by the caller");
  r = await outsider.call("/admin/whiteboards/" + record.id);
  check(
    r.status === 404,
    "unrelated active account cannot open a private board",
  );
  r = await outsider.call("/admin/whiteboards");
  check(
    r.status === 200 && r.json.data.total === 0,
    "unauthorized boards are filtered before inventory counts",
  );
  r = await change(record, "share", {
    email: viewer.email,
    role: "viewer",
    currentPassword: "fictional wrong password",
  });
  check(
    r.status === 403,
    "explicit board sharing requires a correct current password",
  );
  r = await change(record, "share", {
    email: viewer.email,
    role: "viewer",
    currentPassword: credentials.password,
  });
  check(
    r.status === 200,
    "owner grants explicit viewer access without changing chapter role",
  );
  record = r.json.data.record;
  r = await viewer.call("/admin/whiteboards/" + record.id);
  check(
    r.status === 200 &&
      r.json.data.actions.includes("read") &&
      !r.json.data.actions.includes("update"),
    "viewer receives read and export but no edit capability",
  );
  r = await change(record, "save", { document: scene }, viewer.call);
  check(r.status === 403, "viewer cannot write a drawing through the API");
  r = await viewer.call("/admin/whiteboards/" + record.id + "/collaborators");
  check(r.status === 403, "viewer cannot inspect collaborator email inventory");
  r = await change(record, "share", {
    email: editor.email,
    role: "editor",
    currentPassword: credentials.password,
  });
  check(
    r.status === 200,
    "explicit editor access is allowed for an existing blog editor",
  );
  record = r.json.data.record;
  r = await editor.call("/admin/access?route=%2Fadmin%2Fwhiteboard");
  check(
    r.status === 200 && r.json.data.allowed,
    "explicit collaboration grants the whiteboard route without broader chapter permissions",
  );
  const old = record,
    saveKey = randomUUID();
  r = await change(record, "save", { document: scene }, editor.call, saveKey);
  check(
    r.status === 200 && r.json.data.record.version === record.version + 1,
    "authorized editor saves a versioned drawing",
  );
  record = r.json.data.record;
  r = await change(old, "save", { document: scene }, editor.call, saveKey);
  check(
    r.status === 200 && r.json.data.record.version === record.version,
    "same save retry is idempotent even after the version advanced",
  );
  r = await change(old, "save", { document: scene });
  check(
    r.status === 409,
    "stale version cannot silently overwrite a collaborator save",
  );
  r = await change(
    { ...record, updated_at: "2000-01-01T00:00:00.000Z" },
    "save",
    { document: scene },
  );
  check(
    r.status === 409,
    "a correct version with a stale saved timestamp is also rejected",
  );
  const results = await Promise.all([
    change(record, "save", { document: scene }),
    change(
      record,
      "save",
      { document: { ...scene, elements: [rectangle("other-rectangle", 90)] } },
      editor.call,
    ),
  ]);
  check(
    results.filter((v) => v.status === 200).length === 1 &&
      results.filter((v) => v.status === 409).length === 1,
    "two real independent-session saves produce one winner and one conflict",
  );
  record = (await get(record.id)).record;
  r = await change(record, "save", {
    document: {
      ...scene,
      elements: [
        { ...rectangle(), type: "iframe", link: "javascript:alert(1)" },
      ],
    },
  });
  check(
    r.status === 400,
    "embeds and executable element links never enter a saved scene",
  );
  r = await change(record, "rename", { name: "Renamed board", teamId: null });
  check(
    r.status === 400,
    "ordinary metadata edits cannot change the owning scope",
  );
  r = await editor.call("/admin/whiteboards/" + record.id + "/export");
  check(
    r.status === 200 &&
      r.json.data.document.type === "excalidraw" &&
      Object.keys(r.json.data.document.files).length === 0,
    "authorized export returns a portable sanitized local drawing",
  );
  r = await change(record, "unshare", {
    email: viewer.email,
    currentPassword: credentials.password,
  });
  check(
    r.status === 200,
    "explicit collaborator access is recoverably revoked",
  );
  record = r.json.data.record;
  r = await viewer.call("/admin/whiteboards/" + record.id);
  check(
    r.status === 404,
    "removed collaborator loses access on the next HTTP request",
  );
  r = await change(record, "archive", { confirmation: "wrong name" });
  check(r.status === 400, "recoverable archive requires the exact board name");
  r = await change(record, "archive", { confirmation: record.name });
  check(
    r.status === 200 && r.json.data.record.deleted_at,
    "board archive retains the versioned record",
  );
  record = r.json.data.record;
  r = await editor.call("/admin/whiteboards/" + record.id);
  check(
    r.status === 404,
    "archived private board is hidden from ordinary collaborators",
  );
  r = await change(record, "save", { document: scene });
  check(
    r.status === 403,
    "archived drawings are read-only even for an administrator",
  );
  r = await change(record, "restore", { confirmation: record.name });
  check(
    r.status === 200 && !r.json.data.record.deleted_at,
    "administrator restores a board without changing its original scope",
  );
  record = r.json.data.record;
  r = await viewer.call("/admin/whiteboards/" + record.id);
  check(
    r.status === 404,
    "restoration does not reactivate previously removed explicit access",
  );
  const revoke = await db
    .from("admin_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("admin_user_id", editor.id)
    .is("revoked_at", null);
  if (revoke.error) throw new Error("Fixture revocation failed");
  r = await editor.call("/admin/whiteboards/" + record.id);
  check(
    r.status === 401,
    "revoked opaque session cannot continue reading a board",
  );
  await verifySocket(record.id, viewer.call);
  if (process.argv.includes("--hold-for-browser")) {
    console.info("Browser review board: " + record.name);
    const input = createInterface({ input: process.stdin });
    console.info(
      "Commands: change, done. Only this fictional board is affected.",
    );
    for await (const command of input) {
      if (command.trim() === "done") {
        input.close();
        break;
      }
      if (command.trim() === "change") {
        record = (await get(record.id)).record;
        const changed = await change(record, "save", {
          document: {
            ...scene,
            elements: [rectangle("remote-review-update", 250)],
          },
        });
        check(
          changed.status === 200,
          "browser review remote version saved through protected API",
        );
      }
    }
  }
} finally {
  for (const channel of socketChannels) channel.teardown();
  for (const client of socketClients) {
    await client.removeAllChannels();
    client.realtime.disconnect();
  }
  for (const id of boards) {
    const current = (await get(id)).record;
    if (!current.deleted_at) {
      const r = await change(current, "archive", {
        confirmation: current.name,
      });
      if (r.status !== 200)
        throw new Error("Whiteboard fixture cleanup failed " + r.status);
    }
  }
  for (const id of accounts) {
    await db
      .from("admin_users")
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq("id", id);
    await db
      .from("admin_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("admin_user_id", id)
      .is("revoked_at", null);
  }
  await logout();
  if (process.stdin.isTTY) process.stdin.pause();
}
await writeFile(
  new URL(
    "../.docs/phase0/local-whiteboards-integration.json",
    import.meta.url,
  ),
  JSON.stringify(
    {
      note: "Actual local independent-session HTTP checks. Only new fictional accounts and boards used; boards/accounts recoverably archived. No external assets, messages or credentials recorded.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
