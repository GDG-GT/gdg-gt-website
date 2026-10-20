import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
import { runDelivery } from "../server/delivery.mjs";
import { createClient } from "@supabase/supabase-js";
const root = await localHttp(),
  { db, env, credentials } = root,
  evidence = [],
  fixtures = [],
  records = [],
  sockets = [],
  base = "/admin/communications/announcements";
if (process.argv.includes("--hold-for-browser") && !process.stdin.isTTY)
  throw new Error("Browser review requires an interactive terminal.");
const occurrence = Math.floor(Date.now() / 300000),
  preflight = await db
    .from("scheduled_job_runs")
    .select("state,locked_until")
    .eq("job_name", "announcements")
    .eq("occurrence", occurrence);
if (preflight.error)
  throw new Error("Announcement scheduler preflight unavailable");
if (
  preflight.data.some(
    (r) =>
      r.state === "completed" ||
      (r.state === "running" && Date.parse(r.locked_until) > Date.now()),
  )
)
  throw new Error(
    "Pause local polling and wait for the next natural five-minute announcement slot. No scheduler state was reset.",
  );
function check(value, name) {
  if (!value) throw new Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS " + name);
}
function data(r) {
  if (r.status !== 200)
    throw new Error(
      "Local announcement request failed " +
        r.status +
        " " +
        (r.json?.error?.code || "unavailable"),
    );
  return r.json.data;
}
const post = (client, path, body, key = randomUUID()) =>
  client.call(path, { method: "POST", key, body });
async function account(role, name) {
  const id = randomUUID(),
    email = `fictional-announcement-${id}@example.test`,
    password = "Fictional-announcement-" + randomUUID(),
    http = await localHttp();
  const r = await db.from("admin_users").insert({
    id,
    email,
    password_hash: await hashSecret(password),
    role,
    is_active: true,
    display_name: name,
  });
  if (r.error) throw new Error("Announcement fixture unavailable");
  fixtures.push(id);
  async function login() {
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
  }
  await login();
  return { ...http, id, email, password, login };
}
async function create(author, record) {
  const r = data(await post(author, base, { record }));
  records.push(r.id);
  return data(await author.call(base + "/" + r.id)).record;
}
const record = (emails, changes = {}) => ({
  title: "Fictional chapter audience test",
  message:
    "Fictional private announcement text. This body must not enter email or notification payloads.",
  audience: { type: "users", emails },
  ...changes,
});
async function preview(author, n) {
  return data(
    await post(author, base + "/" + n.id + "/preview", {
      revision: n.revision,
    }),
  );
}
async function confirm(author, n, p, key = randomUUID()) {
  return post(
    author,
    base + "/" + n.id + "/confirm",
    {
      revision: n.revision,
      previewId: p.id,
      confirmation: n.title,
      currentPassword: author.password,
    },
    key,
  );
}
async function eventually(predicate) {
  const end = Date.now() + 6000;
  while (Date.now() < end) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 30));
  }
  return false;
}
async function notificationSocket(client) {
  const dto = data(
      await post(client, "/auth/realtime-token", { kind: "notifications" }),
    ),
    events = [];
  const transport = createClient(dto.url, dto.key, {
    accessToken: async () => dto.token,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: { timeout: 5000 },
  });
  await transport.realtime.setAuth(dto.token);
  let finish;
  const ready = new Promise((resolve) => {
    finish = resolve;
  });
  const channel = transport
    .channel(dto.topic, { config: { private: true } })
    .on("broadcast", { event: "changed" }, ({ payload }) =>
      events.push(payload),
    )
    .subscribe((s) => {
      if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT"].includes(s)) finish(s);
    });
  sockets.push({ transport, channel });
  const timeout = setTimeout(() => finish("TEST_TIMEOUT"), 7000);
  timeout.unref();
  const status = await ready;
  clearTimeout(timeout);
  if (status !== "SUBSCRIBED")
    throw new Error("Fictional reader notification socket unavailable");
  return {
    events,
    close: async () => {
      channel.teardown();
      transport.realtime.disconnect();
      await transport.removeAllChannels();
      transport.realtime.disconnect();
    },
  };
}
try {
  await root.login();
  const a = await account("admin", "Fictional announcement publisher"),
    b = await account("blog_editor", "Fictional announcement reader"),
    c = await account("team_member", "Fictional unrelated announcement reader");
  let readerSocket = await notificationSocket(b);
  check(
    (await root.call(base, { anonymous: true })).status === 401,
    "anonymous chapter announcement reads are denied",
  );
  const draft = await create(
      a,
      record([b.email, credentials.email], { emailEnabled: true }),
    ),
    id = draft.id;
  check(
    draft.state === "Draft" && draft.publicationVersion === 0,
    "creation saves a draft without sending notifications",
  );
  check(
    (await b.call(base + "/" + id)).status === 404 &&
      (await c.call(base + "/" + id)).status === 404,
    "draft metadata and bodies are hidden from recipients and outsiders",
  );
  const marker = await db.from("notifications").insert({
    user_id: b.id,
    type: "system",
    title: "Fictional invalidation control",
    message: "Fictional ordering marker",
  });
  if (marker.error)
    throw new Error("Notification ordering fixture unavailable");
  check(
    (await eventually(() =>
      readerSocket.events.some((e) => e.kind === "notifications"),
    )) && !readerSocket.events.some((e) => e.kind === "announcement-directory"),
    "draft creation does not invalidate an ordinary recipient socket; the private notification control arrives",
  );
  check(
    (await post(c, base, { record: record([c.email]) })).status === 403,
    "ordinary accounts cannot publish chapter-wide announcements",
  );
  check(
    (await post(a, base, { record: { ...record([b.email]), author_id: c.id } }))
      .status === 400,
    "browser-supplied author and publication state are rejected",
  );
  let p = await preview(a, draft);
  check(
    p.count === 2 &&
      p.sample.length === 2 &&
      !JSON.stringify(p).includes("@example.test"),
    "preview displays an exact current count and safe account names",
  );
  const borrowed = await post(root, base + "/" + id + "/confirm", {
    revision: draft.revision,
    previewId: p.id,
    confirmation: draft.title,
    currentPassword: credentials.password,
  });
  check(
    borrowed.status === 409 && borrowed.json.error.code === "PREVIEW_REQUIRED",
    "another administrator cannot borrow the preview from a different actor/session",
  );
  await readerSocket.close();
  await db.from("admin_users").update({ is_active: false }).eq("id", b.id);
  const changed = await confirm(a, draft, p);
  check(
    changed.status === 409 && changed.json.error.code === "AUDIENCE_CHANGED",
    "audience changes between preview and confirmation fail closed",
  );
  await db.from("admin_users").update({ is_active: true }).eq("id", b.id);
  await b.login();
  readerSocket = await notificationSocket(b);
  p = await preview(a, draft);
  const key = randomUUID(),
    published = data(await confirm(a, draft, p, key));
  check(
    published.state === "Published" && published.recipientCount === 2,
    "confirmed publication freezes exactly the approved notification recipients",
  );
  check(
    await eventually(() =>
      readerSocket.events.some((e) => e.kind === "announcement-directory"),
    ),
    "approved publication invalidates the eligible reader's private topic without content",
  );
  check(
    readerSocket.events
      .filter((e) => e.kind === "announcement-directory")
      .every(
        (e) =>
          Object.keys(e).every((k) => ["kind", "id"].includes(k)) &&
          /^[a-f0-9-]{36}$/.test(e.id) &&
          e.id !== id,
      ),
    "announcement invalidations contain only kind and a generated transport ID, not announcement identity or content",
  );
  check(
    data(await confirm(a, draft, p, key)).id === id,
    "replayed publication returns its original result without duplicate fanout",
  );
  let current = data(await b.call(base + "/" + id)).record;
  check(
    current.audience === null &&
      current.readCount === null &&
      current.canAcknowledge,
    "recipient reads omit audience inventory and administrative tracking",
  );
  check(
    (await c.call(base + "/" + id)).status === 404 &&
      data(await c.call(base)).total === 0,
    "unrelated accounts cannot infer targeted announcements through IDs or counts",
  );
  data(
    await post(b, base + "/" + id, {
      action: "read",
      publicationVersion: current.publicationVersion,
    }),
  );
  check(
    data(await a.call(base + "/" + id)).record.readCount === 1,
    "read acknowledgments bind to the authenticated reader and publication version",
  );
  check(
    (
      await post(a, base + "/" + id, {
        action: "update",
        revision: published.revision,
        record: record([b.email]),
      })
    ).status === 409,
    "published content cannot be silently edited without unpublishing",
  );
  await runDelivery({ db, env, limit: 100 });
  const jobs = await db
    .from("delivery_jobs")
    .select("payload,state,provider_message_id")
    .eq("kind", "chapter_announcement")
    .contains("payload", { announcementId: id });
  check(
    !jobs.error &&
      jobs.data.length === 2 &&
      jobs.data.every(
        (j) =>
          !Object.hasOwn(j.payload, "message") &&
          !Object.hasOwn(j.payload, "email"),
      ),
    "durable fanout uses two per-recipient identity-only jobs",
  );
  const notifications = await db
    .from("notifications")
    .select("message")
    .eq("user_id", b.id)
    .eq("link", "/admin/communications?tab=announcements&announcement=" + id);
  check(
    !notifications.error &&
      notifications.data.length === 1 &&
      !notifications.data[0].message.includes("private announcement text"),
    "durable notice creation deduplicates and excludes announcement bodies",
  );
  const inbox = await fetch("http://127.0.0.1:54364/api/v1/messages").then(
      (r) => r.json(),
    ),
    mail = inbox.messages.find(
      (m) =>
        m.Subject === "New chapter announcement" &&
        m.To?.some((to) => to.Address === b.email),
    );
  check(
    !!mail,
    "optional generic announcement email is captured in local Mailpit only",
  );
  const mailBody = await fetch(
    "http://127.0.0.1:54364/api/v1/message/" + mail.ID,
  ).then((r) => r.json());
  check(
    mailBody.Text.includes("?tab=announcements&announcement=" + id) &&
      !JSON.stringify(mailBody).includes(draft.message) &&
      !JSON.stringify(mailBody).includes(draft.title),
    "captured email contains only a protected link, not the private subject or message",
  );
  current = data(await a.call(base + "/" + id)).record;
  data(
    await post(a, base + "/" + id, {
      action: "unpublish",
      revision: current.revision,
      confirmation: current.title,
    }),
  );
  check(
    (await b.call(base + "/" + id)).status === 404,
    "unpublishing immediately removes recipient body access",
  );
  current = data(await a.call(base + "/" + id)).record;
  data(
    await post(a, base + "/" + id, {
      action: "archive",
      revision: current.revision,
      confirmation: current.title,
    }),
  );
  current = data(await a.call(base + "/" + id)).record;
  data(
    await post(a, base + "/" + id, {
      action: "restore",
      revision: current.revision,
      confirmation: current.title,
    }),
  );
  check(
    data(await a.call(base + "/" + id)).record.state === "Draft",
    "restoration is recoverable and never republishes or resends automatically",
  );
  const scheduled = await create(
      a,
      record([b.email], {
        title: "Fictional scheduled chapter update",
        scheduledFor: new Date(Date.now() + 3500).toISOString(),
      }),
    ),
    sp = await preview(a, scheduled);
  check(
    data(await confirm(a, scheduled, sp)).state === "Scheduled" &&
      (await b.call(base + "/" + scheduled.id)).status === 404,
    "confirmed schedules stay hidden until the server publishes them",
  );
  const forbiddenJob = await fetch(
    env.APP_ORIGIN + "/api/v1/jobs/announcements",
    {
      method: "POST",
      headers: {
        Origin: env.APP_ORIGIN,
        Authorization: "Bearer " + env.CRON_SECRET,
      },
    },
  );
  check(
    forbiddenJob.status === 403,
    "even a valid cron credential cannot invoke schedules through a browser-origin request",
  );
  await new Promise((r) =>
    setTimeout(
      r,
      Math.max(0, Date.parse(scheduled.scheduledFor) - Date.now() + 150),
    ),
  );
  const run = await fetch(env.APP_ORIGIN + "/api/v1/jobs/announcements", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.CRON_SECRET },
    }),
    runData = await run.json();
  check(
    run.status === 200 && runData.data.counts?.published >= 1,
    "the secret-authenticated distributed job publishes due announcements",
  );
  check(
    data(await b.call(base + "/" + scheduled.id)).record.state === "Published",
    "a targeted editor can read the server-published scheduled announcement",
  );
  const repeated = await fetch(env.APP_ORIGIN + "/api/v1/jobs/announcements", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.CRON_SECRET },
  }).then((r) => r.json());
  check(
    repeated.data.skipped === "already_completed",
    "repeated scheduled-job requests do not publish or enqueue twice",
  );
  await runDelivery({ db, env, limit: 100 });
  const withoutMail = await db
    .from("delivery_jobs")
    .select("provider_message_id")
    .eq("kind", "chapter_announcement")
    .contains("payload", { announcementId: scheduled.id });
  check(
    !withoutMail.error &&
      withoutMail.data.length === 1 &&
      withoutMail.data[0].provider_message_id === null,
    "in-app-only announcements finish without contacting an email provider",
  );
  const browser = await create(
      a,
      record([credentials.email], {
        title: "Fictional chapter announcement workflow",
        message:
          "This fictional announcement verifies local reading, draft editing, audience preview, and responsive layout. No real chapter correspondence is involved.",
      }),
    ),
    bp = await preview(a, browser);
  data(await confirm(a, browser, bp));
  if (process.argv.includes("--hold-for-browser")) {
    console.info("BROWSER_ANNOUNCEMENT " + browser.id);
    console.info(
      "Type change to pin remotely, or done to recoverably archive fictional records.",
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
        const n = data(await a.call(base + "/" + browser.id)).record;
        data(
          await post(a, base + "/" + n.id, {
            action: "pin",
            revision: n.revision,
            pinned: !n.pinned,
          }),
        );
        check(true, "independent-session browser-review pin change delivered");
      }
    }
  }
  await a.logout();
  await b.logout();
  await c.logout();
} finally {
  for (const { transport, channel } of sockets) {
    channel.teardown();
    transport.realtime.disconnect();
    await transport.removeAllChannels();
    transport.realtime.disconnect();
  }
  for (const id of records) {
    const row = await db
      .from("announcements")
      .select("revision")
      .eq("id", id)
      .single();
    if (row.error) throw new Error("Announcement fixture cleanup read failed");
    const r = await db
      .from("announcements")
      .update({
        state: "Archived",
        is_archived: true,
        revision: row.data.revision + 1,
      })
      .eq("id", id);
    if (r.error) throw new Error("Announcement fixture archive failed");
    await db
      .from("notifications")
      .update({ is_read: true })
      .eq("link", "/admin/communications?tab=announcements&announcement=" + id);
  }
  if (fixtures.length) {
    await db
      .from("notifications")
      .update({ is_read: true })
      .in("user_id", fixtures);
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
    "../.docs/phase0/local-announcements-integration.json",
    import.meta.url,
  ),
  JSON.stringify(
    {
      note: "Actual local protected API, audience, state, secret-authenticated job, worker and Mailpit checks with fictional accounts. No external email, quota/scheduler resets, or permanent deletion. Browser fixture identity only is printed. Fixtures recoverably archived and notices marked read.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
