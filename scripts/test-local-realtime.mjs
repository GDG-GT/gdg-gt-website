import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";
import { localHttp } from "./lib/local-http.mjs";
import {
  realtimeConfiguration,
  signRealtimeGrant,
} from "../server/lib/realtime-token.mjs";
import { token, tokenHash } from "../server/lib/security.mjs";
if (process.argv.includes("--hold-for-browser") && !process.stdin.isTTY)
  throw new Error("Browser review requires an interactive terminal.");
const { call, login, logout, db, env, credentials } = await localHttp(),
  evidence = [],
  rooms = [],
  socketChannels = [],
  reviewNotifications = [],
  clients = [];
function check(value, name) {
  if (!value) throw new Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS " + name);
}
function socket(dto, token = dto.token) {
  const c = createClient(dto.url, dto.key, {
    accessToken: async () => token,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: { timeout: 6000, heartbeatIntervalMs: 1000 },
  });
  clients.push(c);
  return c;
}
async function join(client, topic, received = []) {
  await client.realtime.setAuth();
  let observe;
  const events = [],
    reasons = [];
  const first = new Promise((resolve) => {
    observe = resolve;
  });
  const channel = client
    .channel(topic, { config: { private: true } })
    .on("broadcast", { event: "changed" }, (event) =>
      received.push(event.payload),
    )
    .subscribe((status, error) => {
      events.push(status);
      if (error?.message)
        reasons.push(
          String(error.message)
            .replace(
              /[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
              "[redacted token]",
            )
            .replace(
              /sb_(?:publishable|secret)_[A-Za-z0-9_-]+/g,
              "[redacted key]",
            )
            .slice(0, 240),
        );
      if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT"].includes(status))
        observe(status);
    });
  const timeout = new Promise((resolve) => {
    const timer = setTimeout(() => resolve("TEST_TIMEOUT"), 8000);
    timer.unref();
  });
  const status = await Promise.race([first, timeout]);
  socketChannels.push(channel);
  return { channel, status, events, reasons };
}
async function eventually(predicate, ms = 6000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 30));
  }
  return false;
}
const user = (await login()).user;
try {
  let r = await call("/auth/realtime-token", {
    anonymous: true,
    method: "POST",
    body: { kind: "notifications" },
  });
  check(r.status === 401, "anonymous callers cannot mint socket tokens");
  r = await call("/realtime/token", {
    method: "POST",
    body: { kind: "notifications", id: randomUUID() },
  });
  check(
    r.status === 400,
    "notification scope cannot be supplied for an arbitrary user",
  );
  for (const label of ["one", "two"]) {
    r = await call("/admin/channels", {
      method: "POST",
      body: {
        currentPassword: credentials.password,
        record: {
          name: "Fictional socket " + label + " " + randomUUID(),
          visibility: "private",
        },
      },
    });
    if (r.status !== 200)
      throw new Error("Socket fixture room unavailable " + r.status);
    rooms.push(r.json.data.record);
  }
  r = await call("/realtime/token", {
    method: "POST",
    body: { kind: "channel", id: rooms[0].id },
  });
  check(
    r.status === 200 &&
      r.json.data.token &&
      r.json.data.expiresAt * 1000 <= Date.now() + 300000,
    "opaque session receives a maximum five-minute socket token",
  );
  const dto = r.json.data,
    claims = JSON.parse(
      Buffer.from(dto.token.split(".")[1], "base64url").toString(),
    );
  check(
    claims.role === "gdg_realtime" &&
      !Object.hasOwn(claims, "email") &&
      !Object.hasOwn(claims, "password_hash") &&
      claims.exp - claims.iat <= 300,
    "socket JWT carries no chapter-admin role or private profile data",
  );
  const direct = await fetch(dto.url + "/rest/v1/events?select=id", {
    headers: { apikey: dto.key, Authorization: "Bearer " + dto.token },
  });
  check(
    direct.status === 403,
    "socket token cannot read application tables over PostgREST",
  );
  const rpc = await fetch(dto.url + "/rest/v1/rpc/issue_realtime_grant", {
    method: "POST",
    headers: {
      apikey: dto.key,
      Authorization: "Bearer " + dto.token,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  check(
    [401, 403, 404].includes(rpc.status),
    "socket token cannot invoke the protected grant-issuing RPC",
  );
  const received = [],
    client = socket(dto),
    connected = await join(client, dto.topic, received);
  if (connected.status !== "SUBSCRIBED")
    throw new Error(
      "Private socket join failed: " +
        connected.status +
        " " +
        connected.reasons.join("; "),
    );
  check(
    connected.status === "SUBSCRIBED",
    "real private WebSocket authorizes the exact issued room topic",
  );
  const denied = await join(socket(dto), "gdg:channel:" + rooms[1].id);
  check(
    denied.status === "CHANNEL_ERROR",
    "valid JWT cannot subscribe to another room topic",
  );
  const anonymous = await join(socket(dto, ""), dto.topic);
  check(
    anonymous.status === "CHANNEL_ERROR",
    "publishable transport key alone cannot join the private topic",
  );
  const body =
    "Fictional private message that must never appear in a broadcast " +
    randomUUID();
  r = await call("/admin/channels/" + rooms[0].id + "/messages", {
    method: "POST",
    body: { message: body },
    key: randomUUID(),
  });
  check(
    r.status === 200,
    "protected message mutation commits while a socket is subscribed",
  );
  check(
    await eventually(() => received.length > 0),
    "actual database mutation emits a private Realtime invalidation",
  );
  check(
    received.every(
      (p) =>
        p.kind === "channel" &&
        p.id === rooms[0].id &&
        Object.keys(p).every((k) => ["kind", "id"].includes(k)),
    ) && !JSON.stringify(received).includes(body),
    "broadcast carries only scoped invalidation metadata, never message text",
  );
  const parts = dto.token.split("."),
    bad =
      parts[0] +
      "." +
      Buffer.from(JSON.stringify({ ...claims, role: "service_role" })).toString(
        "base64url",
      ) +
      "." +
      parts[2];
  const forged = await join(socket(dto, bad), dto.topic);
  check(
    forged.status === "CHANNEL_ERROR",
    "forged higher-privilege JWT payload fails signature validation",
  );
  const shortClaims = {
    id: claims.jti,
    issuedAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + 4,
    permissionVersion: claims.permission_version,
    topic: dto.topic,
  };
  const short = signRealtimeGrant(
      realtimeConfiguration(env),
      shortClaims,
      claims.sub,
      claims.session_id,
      claims.iss,
    ),
    expires = await join(socket(dto, short), dto.topic);
  check(
    expires.status === "SUBSCRIBED",
    "short-lived fixture JWT is valid before its expiry",
  );
  check(
    await eventually(
      () =>
        expires.events.includes("CHANNEL_ERROR") ||
        expires.events.includes("CLOSED"),
      10000,
    ),
    "Realtime server expires the socket authorization without a refreshed JWT",
  );
  const note = (
      await call("/realtime/token", {
        method: "POST",
        body: { kind: "notifications" },
      })
    ).json.data,
    notices = [],
    noteSocket = await join(socket(note), note.topic, notices);
  check(
    noteSocket.status === "SUBSCRIBED",
    "own notification topic accepts its distinct scoped token",
  );
  const notificationId = randomUUID();
  const inserted = await db.from("notifications").insert({
    id: notificationId,
    user_id: user.id,
    type: "system",
    title: "Fictional live notification",
    message: "Private fixture body not included in live broadcast",
  });
  if (inserted.error) throw new Error("Notification fixture unavailable");
  check(
    (await eventually(() => notices.length > 0)) &&
      notices.every(
        (p) =>
          p.kind === "notifications" &&
          Object.keys(p).every((k) => ["kind", "id"].includes(k)),
      ),
    "notification broadcasts also omit private notification bodies",
  );
  await db
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId);
  const wrongUser = await join(socket(note), "gdg:user:" + randomUUID());
  check(
    wrongUser.status === "CHANNEL_ERROR",
    "own notification JWT cannot join another account topic",
  );
  // Mint and revoke a new fixture session only; preserve the HTTP cleanup session.
  const fixtureSession = randomUUID();
  const insertedSession = await db.from("admin_sessions").insert({
    id: fixtureSession,
    admin_user_id: user.id,
    token_hash: tokenHash(token()),
  });
  if (insertedSession.error) throw new Error("Fixture session unavailable");
  const grantResult = await db.rpc("issue_realtime_grant", {
    p_actor: user.id,
    p_session: fixtureSession,
    p_kind: "channel",
    p_target: rooms[0].id,
    p_request_id: randomUUID(),
  });
  if (grantResult.error) throw new Error("Fixture socket grant unavailable");
  const revocable = signRealtimeGrant(
    realtimeConfiguration(env),
    grantResult.data,
    user.id,
    fixtureSession,
    claims.iss,
  );
  await db
    .from("admin_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", fixtureSession);
  const revoked = await join(socket(dto, revocable), dto.topic);
  check(
    revoked.status === "CHANNEL_ERROR",
    "revoked opaque session cannot authorize a new socket join",
  );
  if (process.argv.includes("--hold-for-browser")) {
    console.info("Browser review room: " + rooms[0].name);
    console.info(
      "Review commands: send, notify, done. Only fictional local fixtures are affected.",
    );
    const input = createInterface({ input: process.stdin });
    for await (const command of input) {
      if (command.trim() === "done") {
        input.close();
        break;
      }
      if (command.trim() === "send") {
        const sent = await call(
          "/admin/channels/" + rooms[0].id + "/messages",
          {
            method: "POST",
            body: {
              message:
                "Live browser verification — this fictional message arrived without a page refresh.",
            },
            key: randomUUID(),
          },
        );
        check(
          sent.status === 200,
          "browser review message committed through protected HTTP",
        );
      }
      if (command.trim() === "notify") {
        const id = randomUUID();
        const result = await db.from("notifications").insert({
          id,
          user_id: user.id,
          type: "system",
          title: "Live browser verification",
          message: "Fictional local update received without a page refresh.",
        });
        check(!result.error, "browser review notification committed");
        reviewNotifications.push(id);
      }
    }
  }
} finally {
  for (const channel of socketChannels) channel.teardown();
  for (const c of clients) {
    const channels = c.getChannels();
    await c.removeAllChannels();
    for (const channel of channels) channel.teardown();
    c.realtime.disconnect();
  }
  for (const id of reviewNotifications)
    await db.from("notifications").update({ is_read: true }).eq("id", id);
  for (const old of rooms) {
    const r = await call("/admin/channels/" + old.id),
      c = r.json?.data?.record;
    if (r.status === 200 && c && !c.is_archived) {
      const archived = await call("/admin/channels/" + c.id, {
        method: "POST",
        body: {
          currentPassword: credentials.password,
          revision: c.revision,
          action: "archive",
          confirmation: c.name,
        },
      });
      if (archived.status !== 200)
        throw new Error("Socket fixture cleanup failed " + archived.status);
    }
  }
  await logout();
}
if (process.stdin.isTTY) process.stdin.pause();
await writeFile(
  new URL("../.docs/phase0/local-realtime-integration.json", import.meta.url),
  JSON.stringify(
    {
      note: "Actual local private WebSocket joins, database broadcasts, JWT expiry/signature checks, topic/session boundaries and PostgREST denial. Payloads are metadata-only. Only new fictional rooms/notification used; rooms archived and notification marked read. No JWTs or transport/signing keys recorded.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
