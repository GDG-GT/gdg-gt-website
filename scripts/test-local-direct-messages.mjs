import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret, riskHash } from "../server/lib/security.mjs";
import { runDelivery } from "../server/delivery.mjs";
import { dockerCommand } from "./lib/disposable-postgres.mjs";
if (process.argv.includes("--hold-for-browser") && !process.stdin.isTTY)
  throw new Error("Browser review requires an interactive terminal.");
const root = await localHttp(),
  { db, env, credentials } = root,
  evidence = [],
  fixtures = [],
  threads = [],
  clients = [],
  channels = [];
const base = "/admin/communications/messages";
let reviewActive = false;
const primary = await db
  .from("admin_users")
  .select("id")
  .eq("email", credentials.email)
  .single();
if (primary.error) throw new Error("Local message review account unavailable");
const headroom = await db.rpc("check_rate_limit", {
  p_scope: "messages.review",
  p_risk_hash: riskHash(primary.data.id, env.RISK_HASH_SECRET),
  p_limit: 4,
});
if (headroom.error || !headroom.data.allowed)
  throw new Error(
    "Wait for the natural review-confirmation cooldown; this suite needs two confirmations. No quota state was reset.",
  );
function check(value, name) {
  if (!value) throw new Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS " + name);
}
function data(r) {
  if (r.status !== 200)
    throw new Error(
      "Expected successful local response: " +
        r.status +
        " " +
        (r.json?.error?.code || "unavailable"),
    );
  return r.json.data;
}
async function send(client, path, body, key = randomUUID()) {
  return client.call(path, { method: "POST", key, body });
}
async function user(role, name) {
  const id = randomUUID(),
    email = `fictional-direct-${id}@example.test`,
    password = "Fictional-direct-" + randomUUID();
  const r = await db
    .from("admin_users")
    .insert({
      id,
      email,
      password_hash: await hashSecret(password),
      role,
      display_name: name,
      is_active: true,
    });
  if (r.error) throw new Error("Direct-message fixture unavailable");
  fixtures.push(id);
  const http = await localHttp();
  data(
    await http.call("/auth/gate", {
      method: "POST",
      body: { code: credentials.gateCode },
    }),
  );
  data(
    await http.call("/auth/login", {
      method: "POST",
      body: { email, password },
    }),
  );
  return { ...http, id, email };
}
async function join(dto, topic = dto.topic, received = [], states = []) {
  const c = createClient(dto.url, dto.key, {
    accessToken: async () => dto.token,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: { timeout: 5000, heartbeatIntervalMs: 1000 },
  });
  clients.push(c);
  await c.realtime.setAuth(dto.token);
  let done;
  const state = new Promise((resolve) => {
    done = resolve;
  });
  const channel = c
    .channel(topic, { config: { private: true } })
    .on("broadcast", { event: "changed" }, ({ payload }) =>
      received.push(payload),
    )
    .subscribe((s) => {
      states.push(s);
      if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT"].includes(s)) done(s);
    });
  channels.push(channel);
  const timer = setTimeout(() => done("TEST_TIMEOUT"), 8000);
  timer.unref();
  const result = await state;
  clearTimeout(timer);
  return result;
}
async function eventually(predicate) {
  const until = Date.now() + 6000;
  while (Date.now() < until) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 30));
  }
  return false;
}
try {
  const rootActor = (await root.login()).user;
  const a = await user("team_member", "Fictional message author"),
    b = await user("blog_editor", "Fictional message recipient"),
    outsider = await user("admin", "Fictional unrelated officer");
  check(
    (await root.call(base, { anonymous: true })).status === 401,
    "anonymous inbox requests are denied",
  );
  const document = {
      recipientEmail: b.email,
      subject: "Fictional private conversation",
      message: "Fictional private alpha — never in broadcasts or notices.",
    },
    key = randomUUID();
  const created = data(await send(a, base, document, key)),
    id = created.id,
    first = created.messageId;
  threads.push(id);
  check(
    !!id && !!first,
    "a member can create a private conversation with an active editor",
  );
  check(
    data(await send(a, base, document, key)).id === id,
    "replayed creation does not duplicate a thread",
  );
  check(
    (await send(a, base, { ...document, subject: "Changed" }, key)).status ===
      409,
    "reused idempotency key rejects a changed request",
  );
  check(
    data(await b.call(base + "/" + id)).record.participant,
    "the fixed recipient can read its conversation",
  );
  check(
    (await outsider.call(base + "/" + id)).status === 404 &&
      (await outsider.call(base + "/" + id + "/history")).status === 404,
    "an unrelated Admin cannot read private metadata or history",
  );
  check(
    (await root.call(base + "/" + id)).status === 404,
    "Super Admin does not receive implicit private body access",
  );
  check(
    data(await root.call(base + "?q=Fictional%20private")).total === 0,
    "own inbox counts exclude unrelated conversations",
  );
  check(
    (await outsider.call(base + "?scope=review")).status === 403 &&
      (await outsider.call(base + "/review")).status === 403,
    "ordinary Admin cannot activate or enumerate review scope",
  );
  check(
    (await send(a, base, { ...document, from_user_id: outsider.id })).status ===
      400,
    "sender attribution cannot be supplied by a browser",
  );
  check(
    (await send(a, base, { ...document, recipientEmail: a.email })).status ===
      409,
    "self conversations are rejected uniformly as unavailable recipients",
  );
  const reply = data(
    await send(b, base + "/" + id + "/items", {
      message: "Fictional beta reply",
      replyToId: first,
    }),
  ).messageId;
  check(!!reply, "recipient can reply with a same-thread quote reference");
  check(
    (
      await send(b, base + "/" + id + "/items/" + first, {
        action: "edit",
        revision: 1,
        message: "Unauthorized",
      })
    ).status === 404,
    "recipients cannot rewrite the other author's text",
  );
  const unicode = "語".repeat(10000);
  const edited = data(
    await send(a, base + "/" + id + "/items/" + first, {
      action: "edit",
      revision: 1,
      message: unicode,
    }),
  );
  check(
    !!edited,
    "full-length Unicode messages fit byte-bounded edit requests",
  );
  check(
    (
      await send(a, base + "/" + id + "/items/" + first, {
        action: "edit",
        revision: 1,
        message: "Stale",
      })
    ).status === 409,
    "stale message revisions fail without overwriting text",
  );
  data(
    await send(a, base + "/" + id + "/items/" + first, {
      action: "delete",
      revision: 2,
    }),
  );
  let history = data(await b.call(base + "/" + id + "/history"));
  check(
    history.items.find((m) => m.id === first).message === "" &&
      history.items.find((m) => m.id === reply).replyPreview ===
        "Message removed",
    "removed bodies disappear from both history and reply previews",
  );
  data(
    await send(a, base + "/" + id + "/items/" + first, {
      action: "restore",
      revision: 3,
    }),
  );
  history = data(await b.call(base + "/" + id + "/history"));
  check(
    history.items.find((m) => m.id === first).message === unicode,
    "author can recover removed content without permanent deletion",
  );
  data(await send(a, base + "/" + id, { action: "read", throughId: reply }));
  history = data(await b.call(base + "/" + id + "/history"));
  check(
    !!history.items.find((m) => m.id === reply).read_at &&
      !history.items.find((m) => m.id === first).read_at,
    "read acknowledgments affect only messages addressed to the current account",
  );
  const projection = data(await a.call(base + "/" + id)).record;
  data(
    await send(a, base + "/" + id, {
      action: "archive",
      revision: projection.stateRevision,
    }),
  );
  check(
    data(await a.call(base + "/" + id)).record.archived &&
      !data(await b.call(base + "/" + id)).record.archived,
    "archiving is personal and does not alter the peer inbox",
  );
  data(
    await send(b, base + "/" + id + "/items", {
      message: "Fictional follow-up unarchives both personal inboxes",
    }),
  );
  check(
    !data(await a.call(base + "/" + id)).record.archived,
    "a fresh reply returns an archived conversation to the recipient inbox",
  );
  const received = [],
    grant = data(
      await send(a, "/auth/realtime-token", { kind: "direct-thread", id }),
    );
  check(
    (await join(grant, grant.topic, received)) === "SUBSCRIBED",
    "participant can join its private direct-message socket",
  );
  check(
    (await join(grant, "gdg:direct-thread:" + randomUUID())) !== "SUBSCRIBED",
    "direct-message JWT cannot join another thread topic",
  );
  check(
    (
      await send(outsider, "/auth/realtime-token", {
        kind: "direct-thread",
        id,
      })
    ).status === 404,
    "unrelated Admin cannot mint a thread socket token",
  );
  data(
    await send(b, base + "/" + id + "/items", {
      message: "Fictional live message — metadata only",
    }),
  );
  check(
    await eventually(() =>
      received.some((v) => v.kind === "direct-thread" && v.id === id),
    ),
    "real message changes arrive through a private socket",
  );
  check(
    received.every((v) =>
      Object.keys(v).every((k) => ["kind", "id"].includes(k)),
    ),
    "live broadcasts never contain messages, subjects or account emails",
  );
  const directRead = await fetch(
    grant.url + "/rest/v1/internal_messages?select=id",
    { headers: { apikey: grant.key, Authorization: "Bearer " + grant.token } },
  );
  check(
    directRead.status === 403,
    "socket credentials cannot read application message tables",
  );
  const review = data(
    await send(root, base + "/review", {
      action: "start",
      reason: "Fictional local integration review only",
      currentPassword: credentials.password,
    }),
  );
  reviewActive = true;
  check(
    review.active && Date.parse(review.expiresAt) <= Date.now() + 300000,
    "password-confirmed review receives a five-minute server expiry",
  );
  check(
    data(await root.call(base + "/" + id)).record.participant === false &&
      data(await root.call(base + "/" + id + "/history")).items.length > 0,
    "explicit review permits audited read-only thread inspection",
  );
  check(
    (await send(root, base + "/" + id, { action: "read", throughId: first }))
      .status === 404 &&
      (
        await send(root, base + "/" + id + "/items", {
          message: "Forged reviewer reply",
        })
      ).status === 404,
    "review cannot impersonate participants or change their read receipts",
  );
  const audit = await db
    .from("admin_actions")
    .select("action")
    .eq("actor_id", rootActor.id)
    .eq("target_id", id)
    .in("action", ["messages.review_read"]);
  check(
    !audit.error && audit.data.length >= 2,
    "review metadata and body reads leave audit records without message content",
  );
  const reviewGrant = data(
    await send(root, "/auth/realtime-token", { kind: "direct-thread", id }),
  );
  check(
    reviewGrant.expiresAt * 1000 <= Date.parse(review.expiresAt),
    "review socket JWT cannot outlive the originating review session",
  );
  data(await send(root, base + "/review", { action: "stop" }));
  reviewActive = false;
  check(
    (await root.call(base + "/" + id)).status === 404 &&
      (await send(root, "/auth/realtime-token", { kind: "direct-thread", id }))
        .status === 404,
    "ending review revokes protected reads and token issuance on the next request",
  );
  data(
    await send(root, base + "/review", {
      action: "start",
      reason: "Fictional short-lived expiry boundary test",
      currentPassword: credentials.password,
    }),
  );
  reviewActive = true;
  // Shorten only this fictional review proof, never sessions, quotas or JWT policy.
  const reviewSession = JSON.parse(
    Buffer.from(reviewGrant.token.split(".")[1], "base64url"),
  ).session_id;
  if (![reviewSession, rootActor.id].every((v) => /^[a-f0-9-]{36}$/.test(v)))
    throw new Error("Invalid local proof fixture identity");
  const shortened = await dockerCommand(
    [
      "exec",
      "-i",
      "supabase_db_gdg-gt-prd-local",
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    `UPDATE gdg_security.direct_review_sessions SET expires_at=now()+interval '4 seconds' WHERE session_id='${reviewSession}' AND actor_id='${rootActor.id}' AND revoked_at IS NULL;`,
  );
  if (shortened.code !== 0 || !shortened.stdout.includes("UPDATE 1"))
    throw new Error("Short-lived review fixture unavailable");
  const shortGrant = data(
      await send(root, "/auth/realtime-token", { kind: "direct-thread", id }),
    ),
    expiryStates = [];
  check(
    shortGrant.expiresAt * 1000 <= Date.now() + 4000 &&
      (await join(shortGrant, shortGrant.topic, [], expiryStates)) ===
        "SUBSCRIBED",
    "near-expiry review receives a capped JWT that can join before expiration",
  );
  check(
    await eventually(
      () =>
        expiryStates.includes("CHANNEL_ERROR") ||
        expiryStates.includes("CLOSED"),
    ),
    "Realtime server closes a review socket when its capped JWT expires",
  );
  check(
    (await root.call(base + "/" + id)).status === 404 &&
      (await send(root, "/auth/realtime-token", { kind: "direct-thread", id }))
        .status === 404,
    "expired review cannot read messages or mint replacement socket grants",
  );
  data(await send(root, base + "/review", { action: "stop" }));
  reviewActive = false;
  // Generic notices go only to the loopback Mailpit sink. No provider keys used.
  await runDelivery({ db, env, limit: 50 });
  const notice = await db
    .from("notifications")
    .select("title,message,link")
    .eq("user_id", b.id)
    .eq("link", "/admin/communications?tab=messages&thread=" + id);
  check(
    !notice.error &&
      notice.data.length > 0 &&
      notice.data.every(
        (n) => !n.message.includes("alpha") && !n.message.includes("語"),
      ),
    "durable in-app notices contain only a protected link and generic text",
  );
  const jobs = await db
    .from("delivery_jobs")
    .select("payload,state")
    .eq("kind", "direct_message_notice")
    .contains("payload", { threadId: id });
  check(
    !jobs.error &&
      jobs.data.length > 0 &&
      jobs.data.every(
        (j) =>
          !Object.hasOwn(j.payload, "message") &&
          !Object.hasOwn(j.payload, "subject"),
      ),
    "durable job payloads store identity only, not copied private bodies",
  );
  const mailbox = await fetch("http://127.0.0.1:54364/api/v1/messages").then(
    (r) => r.json(),
  );
  const captured = mailbox.messages.find(
    (m) =>
      m.Subject === "New private chapter message" &&
      m.To?.some((to) => to.Address === b.email),
  );
  check(
    !!captured,
    "generic message email is captured only in the local Mailpit sink",
  );
  const mailBody = await fetch(
    "http://127.0.0.1:54364/api/v1/message/" + captured.ID,
  ).then((r) => r.json());
  check(
    mailBody.Text.includes("?tab=messages&thread=" + id) &&
      !JSON.stringify(mailBody).includes("Fictional private alpha") &&
      !JSON.stringify(mailBody).includes("語"),
    "captured email contains the protected deep link without private subject or message text",
  );
  // Create an own-thread fixture for visual review using the existing signed-in browser.
  const browserThread = data(
    await send(b, base, {
      recipientEmail: credentials.email,
      subject: "Fictional message workflow review",
      message:
        "Let’s use this fictional conversation to verify replies, read receipts, and the phone layout. Nothing here is real chapter correspondence.",
    }),
  );
  threads.push(browserThread.id);
  if (process.argv.includes("--hold-for-browser")) {
    console.info("BROWSER_THREAD " + browserThread.id);
    console.info(
      "Type change to send a remote follow-up, or done to recoverably archive fixtures.",
    );
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    for await (const line of rl) {
      if (line.trim() === "done") {
        rl.close();
        break;
      }
      if (line.trim() === "change") {
        data(
          await send(b, base + "/" + browserThread.id + "/items", {
            message:
              "Fictional remote follow-up: live updates keep the conversation current without discarding your reply draft.",
          }),
        );
        check(true, "independent-session browser-review follow-up delivered");
      }
    }
  }
  await a.logout();
  await b.logout();
  await outsider.logout();
} finally {
  if (reviewActive) await send(root, base + "/review", { action: "stop" });
  for (const ch of channels) ch.teardown();
  for (const c of clients) {
    c.realtime.disconnect();
    await c.removeAllChannels();
    c.realtime.disconnect();
  }
  if (threads.length) {
    const state = await db
      .from("direct_thread_states")
      .select("thread_id,user_id,revision")
      .in("thread_id", threads);
    if (state.error) throw new Error("Message fixture archive read failed");
    for (const row of state.data) {
      const r = await db
        .from("direct_thread_states")
        .update({ is_archived: true, revision: row.revision + 1 })
        .eq("thread_id", row.thread_id)
        .eq("user_id", row.user_id);
      if (r.error) throw new Error("Message fixture archive failed");
    }
    for (const id of threads)
      await db
        .from("notifications")
        .update({ is_read: true })
        .eq("link", "/admin/communications?tab=messages&thread=" + id);
  }
  if (fixtures.length) {
    await db
      .from("admin_users")
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .in("id", fixtures);
    await db
      .from("admin_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .in("admin_user_id", fixtures)
      .is("revoked_at", null);
  }
  await root.logout();
}
await writeFile(
  new URL(
    "../.docs/phase0/local-direct-messages-integration.json",
    import.meta.url,
  ),
  JSON.stringify(
    {
      note: "Real local protected HTTP, private WebSocket, audit and generic-notice checks with independent fictional sessions. No external mail, quota resets or permanent deletions. Fictional accounts and threads recoverably archived. Browser fixture IDs only are printed; no credentials or recipient emails are logged.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
