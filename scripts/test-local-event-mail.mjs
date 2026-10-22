import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret, tokenHash } from "../server/lib/security.mjs";
import { runDelivery } from "../server/delivery.mjs";
const h = await localHttp(),
  { db, env } = h,
  evidence = [],
  accounts = [],
  marker = randomUUID().slice(0, 8);
const sql = (r) => {
  if (r.error)
    throw Error("Event mail fixture database error: " + r.error.code);
  return r.data;
};
const data = (r) => {
  if (r.status !== 200)
    throw Error(
      "Event mail API error: " + r.status + " " + r.json?.error?.code,
    );
  return r.json.data;
};
const check = (ok, name) => {
  if (!ok) throw Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS", name);
};
async function signIn(client, email, password) {
  data(
    await client.call("/auth/gate", {
      method: "POST",
      body: { code: h.credentials.gateCode },
    }),
  );
  data(
    await client.call("/auth/login", {
      method: "POST",
      body: { email, password },
    }),
  );
  return client;
}
async function account(role) {
  const id = randomUUID(),
    email = `fictional-event-mail-${role}-${id}@example.test`,
    password = "Fixture-" + randomUUID(),
    client = await localHttp();
  sql(
    await db
      .from("admin_users")
      .insert({
        id,
        email,
        password_hash: await hashSecret(password),
        role,
        is_active: true,
      }),
  );
  accounts.push({ id, client });
  await signIn(client, email, password);
  return { ...client, id, email, password };
}
let admin, otherSession, outsider, event;
const messages = [],
  recipients = [
    `fictional-event-mail-first-${marker}@example.test`,
    `fictional-event-mail-second-${marker}@example.test`,
  ];
try {
  check(
    env.MAIL_MODE === "local",
    "event mail tests cannot use an external email provider",
  );
  const pending = sql(
    await db
      .from("delivery_jobs")
      .select("id")
      .eq("kind", "event_message")
      .in("state", ["pending", "running"]),
  );
  if (pending.length)
    throw Error(
      "Resolve existing event mail jobs before this deterministic suite; it never claims unrelated recipients.",
    );
  admin = await account("admin");
  otherSession = await signIn(await localHttp(), admin.email, admin.password);
  outsider = await account("team_member");
  event = data(
    await admin.call("/admin/events", {
      method: "POST",
      body: {
        event: {
          title: `Fictional email review ${marker}`,
          slug: `fictional-email-review-${marker}`,
          description: "Fictional local email workflow fixture only.",
          start_at: new Date(Date.now() + 3 * 86400000).toISOString(),
          location: "Fictional local fixture",
        },
      },
    }),
  ).event;
  const reviewPath = `/admin/events/${event.id}/email-review`,
    approvalPath = `/admin/events/${event.id}/email`,
    content = {
      subject: `Fictional event message ${marker}`,
      message:
        "Fictional local event update. <img src=x onerror=alert(1)> No real recipient is contacted.",
    },
    review = () => admin.call(reviewPath, { method: "POST", body: content }),
    approve = (
      client,
      r,
      password = admin.password,
      key = randomUUID(),
      confirmation = "SEND 2",
    ) =>
      client.call(approvalPath, {
        method: "POST",
        body: { reviewId: r.reviewId, currentPassword: password, confirmation },
        key,
      });
  check(
    (await review()).status === 409,
    "draft events cannot queue attendee email",
  );
  event = data(
    await admin.call(`/admin/events/${event.id}/publish`, {
      method: "POST",
      body: { revision: event.revision, event: {} },
    }),
  ).event;
  const rows = sql(
    await db
      .from("event_attendance")
      .insert(
        recipients.map((attendee_email, i) => ({
          event_id: event.id,
          attendee_name: `Fictional attendee ${i + 1}`,
          attendee_email,
          idempotency_key: tokenHash(randomUUID()),
          request_hash: tokenHash(randomUUID()),
        })),
      )
      .select("id,attendee_email"),
  );
  check(
    data(await admin.call(approvalPath)).recipientCount === 2,
    "server computes the current event-only audience count",
  );
  check(
    (
      await h.call(reviewPath, {
        method: "POST",
        body: content,
        anonymous: true,
      })
    ).status === 401,
    "anonymous callers cannot review an event audience",
  );
  check(
    (await outsider.call(reviewPath, { method: "POST", body: content }))
      .status === 404,
    "unrelated team members cannot inspect chapter recipient identities",
  );
  check(
    (await admin.call(reviewPath, { method: "GET" })).status === 405,
    "audience review is an explicit protected POST action",
  );
  check(
    (
      await admin.call(reviewPath, {
        method: "POST",
        body: { ...content, to: ["outsider@example.test"] },
      })
    ).status === 400,
    "reviews reject arbitrary recipient injection",
  );
  check(
    (
      await admin.call(approvalPath, {
        method: "POST",
        body: { ...content, expectedRecipientCount: 2, confirmed: true },
        key: randomUUID(),
      })
    ).status === 400,
    "retired count-only approvals cannot send mail",
  );
  let r = data(await review());
  check(
    r.count === 2 &&
      r.recipients.every((p) => recipients.includes(p.email)) &&
      r.message === content.message &&
      new Date(r.expiresAt) > new Date(),
    "review returns exact saved identities, count, content and expiry",
  );
  check(
    (await approve(otherSession, r)).status === 409,
    "a second session cannot reuse the first session's send review",
  );
  check(
    (await approve(admin, r, "wrong-fictional-password")).status === 403,
    "current password is required before event fan-out",
  );
  check(
    (await approve(admin, r, admin.password, randomUUID(), "SEND 3")).status ===
      400,
    "typed final count must match the reviewed audience",
  );
  sql(
    await db
      .from("event_attendance")
      .update({ attendee_email: `fictional-changed-${marker}@example.test` })
      .eq("id", rows[0].id),
  );
  check(
    (await approve(admin, r)).json?.error?.code === "AUDIENCE_CHANGED",
    "same-count recipient identity changes invalidate approval",
  );
  sql(
    await db
      .from("event_attendance")
      .update({ attendee_email: rows[0].attendee_email })
      .eq("id", rows[0].id),
  );
  sql(
    await db
      .from("event_mail_reviews")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", r.reviewId),
  );
  check(
    (await approve(admin, r)).status === 409,
    "expired audience reviews cannot queue mail",
  );
  r = data(await review());
  const key = randomUUID(),
    committed = data(await approve(admin, r, admin.password, key));
  messages.push(committed.messageId);
  check(
    committed.queued && committed.recipientCount === 2,
    "approved content queues a bounded frozen event audience",
  );
  check(
    data(await approve(admin, r, admin.password, key)).messageId ===
      committed.messageId,
    "an ambiguous approval retry returns the same message without fan-out duplication",
  );
  check(
    (await approve(admin, r)).status === 409,
    "consumed reviews cannot queue another batch with a new key",
  );
  const jobs = sql(
    await db
      .from("delivery_jobs")
      .select("id,payload,secret_payload")
      .eq("kind", "event_message")
      .eq("payload->>messageId", committed.messageId),
  );
  check(
    jobs.length === 2 &&
      jobs.every(
        (j) =>
          !j.secret_payload &&
          !JSON.stringify(j.payload).includes("@") &&
          !JSON.stringify(j.payload).includes(content.message),
      ),
    "durable jobs store only record references, not message bodies or recipient addresses",
  );
  sql(
    await db
      .from("event_attendance")
      .update({ attendee_email: `fictional-later-${marker}@example.test` })
      .eq("id", rows[0].id),
  );
  const isolatedDb = {
    from: (...args) => db.from(...args),
    rpc: (name, args) =>
      name === "claim_delivery_jobs"
        ? db.rpc("claim_worker_jobs", {
            p_limit: args.p_limit,
            p_kinds: ["event_message"],
          })
        : db.rpc(name, args),
  };
  const outcome = await runDelivery({ db: isolatedDb, env, limit: 10 });
  check(
    outcome.completed === 2 && !outcome.retried,
    "actual delivery rechecks and safely completes the changed-recipient skip",
  );
  const done = sql(
    await db
      .from("delivery_jobs")
      .select("id,provider_message_id,state")
      .in(
        "id",
        jobs.map((j) => j.id),
      ),
  );
  check(
    done.filter((j) => j.provider_message_id).length === 1 &&
      done.every((j) => j.state === "completed"),
    "only the still-authorized frozen address receives a provider-accepted message",
  );
  const inbox = await fetch("http://127.0.0.1:54364/api/v1/messages").then(
      (r) => r.json(),
    ),
    sent = inbox.messages.filter((m) => m.Subject === content.subject);
  check(
    sent.length === 1 && sent[0].To?.[0]?.Address === recipients[1],
    "real loopback SMTP captured exactly one event email for the valid recipient",
  );
  const detail = await fetch(
    `http://127.0.0.1:54364/api/v1/message/${sent[0].ID}`,
  ).then((r) => r.json());
  check(
    detail.Text.includes(content.message) &&
      detail.HTML.includes("&lt;img") &&
      !detail.HTML.includes("<img"),
    "server-rendered event mail escapes stored untrusted HTML",
  );
  if (process.argv.includes("--hold-for-browser")) {
    if (!process.stdin.isTTY)
      throw Error("Browser hold requires an interactive terminal.");
    console.info(
      "Fictional event mail fixture is available for read-only browser review. Marker: " +
        marker +
        ". Type done to archive.",
    );
    const input = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    for await (const line of input) if (line.trim() === "done") break;
    input.close();
  }
} finally {
  if (event) {
    const current = sql(
      await db.from("events").select("revision").eq("id", event.id).single(),
    );
    if (admin)
      data(
        await admin.call(`/admin/events/${event.id}`, {
          method: "DELETE",
          body: { revision: current.revision, event: {} },
        }),
      );
  }
  for (const a of accounts) {
    await a.client.logout().catch(() => undefined);
    sql(
      await db.from("admin_users").update({ is_active: false }).eq("id", a.id),
    );
  }
  if (otherSession) await otherSession.logout().catch(() => undefined);
}
await writeFile(
  new URL("../.docs/phase0/local-event-mail.json", import.meta.url),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      environment:
        "Fictional loopback event/accounts/recipients; real protected HTTP, PostgreSQL and SMTP. Only suite-owned event is recoverably archived. No external provider call.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
