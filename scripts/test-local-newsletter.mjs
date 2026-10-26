import { randomUUID, randomBytes, createHmac } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
import { runDelivery } from "../server/delivery.mjs";
import { runNewsletterWorker } from "../server/newsletter-worker.mjs";
import { applicationHandler } from "../server/handler.mjs";
import { SecurityStore } from "../server/db/security-store.mjs";
import { serverConfig } from "../server/config.mjs";
const h = await localHttp(),
  { db, env, call } = h,
  actor = randomUUID(),
  email = `fictional-newsletter-${actor}@example.test`,
  password = "Newsletter-fixture-" + randomUUID(),
  evidence = [];
const sql = (r) => {
  if (r.error)
    throw Error("Newsletter fixture database error: " + r.error.code);
  return r.data;
};
const data = (r) => {
  if (r.status !== 200)
    throw Error(
      "Newsletter API error: " + r.status + " " + r.json?.error?.code,
    );
  return r.json.data;
};
const check = (v, name) => {
  if (!v) throw Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS", name);
};
const post = (path, body, key = randomUUID()) =>
  call(path, { method: "POST", body, key });
const base = "/admin/newsletter";
let team, callbackServer;
async function mailTo(address, subjectPart) {
  for (let n = 0; n < 20; n++) {
    const result = await (
      await fetch("http://127.0.0.1:54364/api/v1/messages")
    ).json();
    const found = result.messages.find(
      (m) =>
        m.To.some((to) => to.Address === address) &&
        (!subjectPart || m.Subject.includes(subjectPart)),
    );
    if (found)
      return (
        await fetch(`http://127.0.0.1:54364/api/v1/message/${found.ID}`)
      ).json();
    await new Promise((r) => setTimeout(r, 250));
  }
  throw Error("Fictional local captured mail not found");
}
try {
  check(
    env.MAIL_MODE === "local",
    "all email tests are restricted to loopback SMTP capture",
  );
  sql(
    await db.from("admin_users").insert({
      id: actor,
      email,
      password_hash: await hashSecret(password),
      role: "admin",
      is_active: true,
    }),
  );
  data(await post("/auth/gate", { code: h.credentials.gateCode }));
  data(await post("/auth/login", { email, password }));
  team = sql(
    await db
      .from("admin_teams")
      .insert({
        name: "Fictional newsletter " + actor.slice(0, 8),
        slug: "newsletter-test-" + actor.slice(0, 8),
        created_by: actor,
      })
      .select("id")
      .single(),
  );
  const scope = team.id,
    recipient = `fictional-newsletter-recipient-${actor}@example.test`,
    other = `fictional-newsletter-other-${actor}@example.test`;
  check(
    (await call(base + "/subscribers", { anonymous: true })).status === 401,
    "anonymous subscriber listing is denied",
  );
  check(
    (
      await post(base + "/subscribers", {
        teamId: scope,
        email: recipient,
        name: "Fixture",
        consentAcknowledged: true,
        state: "active",
      })
    ).status === 400,
    "subscriber creation cannot forge confirmed state",
  );
  data(
    await post(base + "/subscribers", {
      teamId: scope,
      email: recipient,
      name: "Fixture",
      consentAcknowledged: true,
    }),
  );
  let list = data(await call(base + "/subscribers?team=" + scope)),
    subscriber = list.items[0];
  check(
    subscriber.state === "pending" && !subscriber.confirmedAt,
    "actual subscriber request starts pending double opt-in",
  );
  await runDelivery({ db, env, limit: 25 });
  const confirmationMail = await mailTo(recipient),
    confirmationToken = confirmationMail.Text.match(
      /\/newsletter\/confirm#token=([A-Za-z0-9_-]{43})/,
    )?.[1];
  check(
    !!confirmationToken,
    "double opt-in confirmation is delivered through real local SMTP",
  );
  const tokenReview = data(
    await call("/newsletter/confirm/validate", {
      method: "POST",
      body: { token: confirmationToken },
      anonymous: true,
    }),
  );
  check(
    tokenReview.valid &&
      !tokenReview.applied &&
      data(await call(base + "/subscribers/" + subscriber.id)).record.state ===
        "pending",
    "opening a confirmation review validates without activating the subscriber",
  );
  check(
    !data(
      await call("/newsletter/unsubscribe/validate", {
        method: "POST",
        body: { token: confirmationToken },
        anonymous: true,
      }),
    ).valid,
    "token review rejects a confirmation capability used for unsubscribe",
  );
  data(
    await call("/newsletter/confirm", {
      method: "POST",
      body: { token: confirmationToken },
      anonymous: true,
    }),
  );
  subscriber = data(await call(base + "/subscribers/" + subscriber.id)).record;
  check(
    subscriber.state === "active" && !!subscriber.confirmedAt,
    "public POST token confirmation activates only the intended subscriber",
  );
  data(
    await call("/newsletter/confirm", {
      method: "POST",
      body: { token: confirmationToken },
      anonymous: true,
    }),
  );
  const confirmedAgain = data(
    await call(base + "/subscribers/" + subscriber.id),
  ).record;
  check(
    confirmedAgain.revision === subscriber.revision &&
      data(
        await call("/newsletter/confirm/validate", {
          method: "POST",
          body: { token: confirmationToken },
          anonymous: true,
        }),
      ).applied,
    "a confirmation retry returns safe success without another subscriber mutation",
  );
  const template = data(
    await post(base + "/templates", {
      teamId: scope,
      record: {
        name: "Fictional reusable template",
        description: "Synthetic only",
        content: "<script>fixture</script>\nhttps://example.com/fixture",
      },
    }),
  );
  const preview = data(
    await call(base + "/templates/" + template.id + "/preview"),
  );
  check(
    !preview.html.includes("<script>") &&
      preview.html.includes("&lt;script&gt;") &&
      preview.html.includes('href="https://example.com/fixture"'),
    "saved template preview escapes stored HTML and permits safe HTTPS links",
  );
  let campaign = data(
    await post(base + "/campaigns", {
      teamId: scope,
      record: {
        subject: "Fictional newsletter integration " + actor.slice(0, 8),
        content: "Synthetic campaign only.\nhttps://example.com/fixture",
        audience: "all",
        recipientIds: [],
      },
    }),
  );
  const id = campaign.id,
    path = base + "/campaigns/" + id;
  check(
    (
      await post(path + "/test", {
        revision: 1,
        currentPassword: "incorrect",
        confirmation: "SEND TEST",
      })
    ).status === 403,
    "test sends require the actual current password",
  );
  data(
    await post(path + "/test", {
      revision: 1,
      currentPassword: password,
      confirmation: "SEND TEST",
    }),
  );
  await runNewsletterWorker({ db, env, limit: 25 });
  const testMail = await mailTo(email, "[TEST]");
  check(
    testMail.Text.includes("No campaign audience was contacted"),
    "self-only test copy is captured at the requesting chapter account address",
  );
  let review = data(await post(path + "/send-review", { revision: 1 }));
  check(
    review.count === 1 && review.recipients[0].email === recipient,
    "send review resolves only currently confirmed scope recipients",
  );
  const second = sql(
    await db
      .from("newsletter_subscribers")
      .insert({
        email: other,
        name: "Synthetic preconfirmed fixture",
        team_id: scope,
        state: "active",
        is_active: true,
        consent_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
      })
      .select("id")
      .single(),
  );
  const approval = (r, count, scheduledAt = null) => ({
    reviewId: r.reviewId,
    reviewToken: r.reviewToken,
    currentPassword: password,
    confirmation: "SEND " + count,
    scheduledAt,
  });
  check(
    (await post(path + "/send", approval(review, 1))).status === 409,
    "audience changes invalidate a previously reviewed send",
  );
  review = data(await post(path + "/send-review", { revision: 1 }));
  const retryKey = randomUUID(),
    body = approval(review, 2);
  data(await post(path + "/send", body, retryKey));
  data(await post(path + "/send", body, retryKey));
  check(
    sql(
      await db
        .from("newsletter_campaign_recipients")
        .select("id")
        .eq("campaign_id", id),
    ).length === 2,
    "same send idempotency key never duplicates the frozen recipient snapshot",
  );
  check(
    (
      await post(path, {
        action: "update",
        revision: 2,
        record: {
          subject: "Rewritten",
          content: "No",
          audience: "all",
          recipientIds: [],
        },
      })
    ).status === 409,
    "approved content cannot be rewritten",
  );
  check(
    (await post(path + "/send", body)).status === 409,
    "approved campaign cannot send a second time with a different retry key",
  );
  data(
    await db
      .rpc("advance_newsletter_campaigns")
      .then((r) => ({ status: r.error ? 503 : 200, json: { data: sql(r) } })),
  );
  let secondRecord = data(
    await call(base + "/subscribers/" + second.id),
  ).record;
  data(
    await post(base + "/subscribers/" + second.id, {
      action: "deactivate",
      revision: secondRecord.revision,
    }),
  );
  await runNewsletterWorker({ db, env, limit: 25 });
  const sentMail = await mailTo(recipient, "Fictional newsletter integration"),
    unsubscribeToken = sentMail.Text.match(
      /\/newsletter\/unsubscribe#token=([A-Za-z0-9_-]{43})/,
    )?.[1];
  check(
    !!unsubscribeToken &&
      sentMail.HTML.includes("Unsubscribe from this newsletter"),
    "campaign delivery includes a unique functional unsubscribe link in text and HTML",
  );
  let delivery = data(await call(path + "/delivery"));
  check(
    delivery.counts.accepted === 1 &&
      delivery.counts.skipped === 1 &&
      delivery.status === "sent",
    "delivery rechecks unsubscribes after approval and reports acceptance separately from inbox delivery",
  );
  const duplicate = data(
      await post(path, {
        action: "duplicate",
        revision: data(await call(path)).record.revision,
      }),
    ),
    duplicatePath = base + "/campaigns/" + duplicate.id;
  const futureReview = data(
    await post(duplicatePath + "/send-review", { revision: 1 }),
  );
  data(
    await post(
      duplicatePath + "/send",
      approval(futureReview, 1, new Date(Date.now() + 3600000).toISOString()),
    ),
  );
  let scheduled = data(await call(duplicatePath)).record;
  check(
    scheduled.status === "scheduled",
    "scheduled campaigns persist without any browser scheduler",
  );
  data(
    await post(duplicatePath + "/cancel", {
      revision: scheduled.revision,
      currentPassword: password,
      confirmation: "CANCEL SEND",
    }),
  );
  check(
    data(await call(duplicatePath)).record.status === "cancelled",
    "password-confirmed cancellation stops queued campaign work",
  );
  const retained = sql(
    await db
      .from("newsletter_campaign_recipients")
      .select("provider_message_id")
      .eq("campaign_id", id)
      .eq("state", "sent")
      .single(),
  );
  const secretBytes = randomBytes(32),
    webhookEnv = {
      RESEND_WEBHOOK_SECRET: "whsec_" + secretBytes.toString("base64"),
    };
  callbackServer = createServer(
    applicationHandler({
      db,
      store: new SecurityStore(db),
      config: serverConfig(env),
      log: () => {},
      webhookEnv,
    }),
  );
  callbackServer.listen(0, "127.0.0.1");
  await once(callbackServer, "listening");
  const raw = JSON.stringify({
      type: "email.bounced",
      created_at: new Date().toISOString(),
      data: { email_id: retained.provider_message_id, to: [recipient] },
    }),
    eventId = "evt_" + randomUUID(),
    timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secretBytes)
      .update(eventId + "." + timestamp + "." + raw)
      .digest("base64"),
    headers = {
      "Content-Type": "application/json",
      "svix-id": eventId,
      "svix-timestamp": timestamp,
      "svix-signature": "v1," + signature,
    };
  const callback = (body, extra = {}) =>
    fetch(
      `http://127.0.0.1:${callbackServer.address().port}/api/v1/webhooks/resend`,
      {
        method: "POST",
        headers: { ...headers, ...extra },
        body,
        signal: AbortSignal.timeout(10000),
      },
    );
  check(
    (await callback(raw + " ")).status === 401,
    "actual callback HTTP rejects tampered raw bytes",
  );
  check(
    (await callback(raw, { Origin: env.APP_ORIGIN })).status === 403,
    "provider callbacks reject browser-origin requests",
  );
  check(
    (await callback(raw)).status === 200 &&
      (await callback(raw)).status === 200,
    "signed provider HTTP callbacks are accepted idempotently",
  );
  subscriber = data(await call(base + "/subscribers/" + subscriber.id)).record;
  delivery = data(await call(path + "/delivery"));
  check(
    subscriber.state === "unsubscribed" &&
      subscriber.suppressionReason === "hard_bounce" &&
      delivery.counts.bounced === 1,
    "verified hard-bounce callback suppresses future sends and updates protected results",
  );
  const exported = data(
    await post(base + "/subscribers/export", {
      team: scope,
      state: "current",
      q: "",
    }),
  );
  check(
    exported.count === 2 &&
      exported.csv.includes(recipient) &&
      !exported.csv.includes("token_hash"),
    "audited subscriber CSV export is scoped and excludes token material",
  );
  check(
    (await call(path + "/delivery?page=1&page=2")).status === 400,
    "delivery results reject repeated pagination selectors",
  );
  check(
    !JSON.stringify(delivery).includes("secret_payload") &&
      !JSON.stringify(delivery).includes("unsubscribe_hash"),
    "delivery status never exposes stored unsubscribe capabilities",
  );
  data(
    await call("/newsletter/unsubscribe", {
      method: "POST",
      body: { token: unsubscribeToken },
      anonymous: true,
    }),
  );
  check(
    data(
      await call("/newsletter/unsubscribe/validate", {
        method: "POST",
        body: { token: unsubscribeToken },
        anonymous: true,
      }),
    ).applied,
    "read-only unsubscribe review recognizes an already committed opt-out",
  );
  check(
    data(await call(base + "/subscribers/" + subscriber.id)).record.state ===
      "unsubscribed",
    "public unsubscribe remains safe after provider suppression",
  );
  const currentSubscribers = data(
      await call(base + "/subscribers?team=" + scope),
    ).items,
    selectedRecords = currentSubscribers.map((r) => ({
      id: r.id,
      revision: r.revision,
    }));
  const bulkBody = {
    action: "archive",
    records: selectedRecords,
    confirmation: "ARCHIVE 2",
    currentPassword: password,
  };
  check(
    (
      await post(base + "/subscribers/bulk", {
        ...bulkBody,
        currentPassword: "incorrect",
      })
    ).status === 403,
    "bulk subscriber cleanup requires the current password",
  );
  check(
    (
      await post(base + "/subscribers/bulk", {
        ...bulkBody,
        records: [
          { ...selectedRecords[0] },
          { ...selectedRecords[1], revision: 9999 },
        ],
      })
    ).status === 409 &&
      !data(await call(base + "/subscribers/" + selectedRecords[0].id)).record
        .deletedAt,
    "stale bulk cleanup rolls back all selected records atomically",
  );
  const bulkKey = randomUUID();
  data(await post(base + "/subscribers/bulk", bulkBody, bulkKey));
  data(await post(base + "/subscribers/bulk", bulkBody, bulkKey));
  check(
    data(await call(base + "/subscribers?team=" + scope + "&state=trash"))
      .total === 2,
    "reviewed bulk archive is idempotent and recoverable",
  );
  const archivedRows = data(
    await call(base + "/subscribers?team=" + scope + "&state=trash"),
  ).items;
  data(
    await post(base + "/subscribers/bulk", {
      action: "restore",
      records: archivedRows.map((r) => ({ id: r.id, revision: r.revision })),
      confirmation: "RESTORE 2",
      currentPassword: password,
    }),
  );
  check(
    data(await call(base + "/subscribers?team=" + scope)).items.every(
      (r) => r.state === "unsubscribed",
    ),
    "bulk restoration never restores consent or silently activates addresses",
  );
  const tokenCountBefore = sql(
    await db
      .from("newsletter_tokens")
      .select("id")
      .eq("subscriber_id", subscriber.id),
  ).length;
  data(
    await call("/newsletter/subscriptions", {
      method: "POST",
      body: { email: recipient, name: "Fixture", website: "" },
      key: randomUUID(),
      anonymous: true,
    }),
  );
  check(
    sql(
      await db
        .from("newsletter_tokens")
        .select("id")
        .eq("subscriber_id", subscriber.id),
    ).length === tokenCountBefore,
    "public signup returns a generic response without re-queuing mail for a suppressed address",
  );
  if (process.argv.includes("--hold-for-browser")) {
    sql(
      await db.from("newsletter_subscribers").insert({
        email: `fictional-newsletter-browser-${actor}@example.test`,
        name: "Synthetic browser fixture",
        team_id: scope,
        state: "active",
        is_active: true,
        consent_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
      }),
    );
    data(
      await post(base + "/campaigns", {
        teamId: scope,
        record: {
          subject: "Fictional browser review — do not send",
          content:
            "This is a synthetic local UI check.\n\nWe are reviewing a private draft and its confirmed audience. No real subscriber data is included.\n\nhttps://example.com/fixture",
          audience: "all",
          recipientIds: [],
        },
      }),
    );
    console.info(
      "Fictional newsletter browser fixtures ready. Enter done to archive them.",
    );
    const reader = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    await new Promise((resolve) => reader.once("line", resolve));
    reader.close();
  }
} finally {
  if (callbackServer) {
    callbackServer.closeAllConnections();
    await new Promise((resolve) => callbackServer.close(resolve));
  }
  if (team) {
    const campaigns = sql(
      await db
        .from("newsletter_campaigns")
        .select("id,revision,status,deleted_at")
        .eq("team_id", team.id),
    );
    for (const c of campaigns) {
      if (["scheduled", "sending"].includes(c.status))
        await post(`${base}/campaigns/${c.id}/cancel`, {
          revision: c.revision,
          currentPassword: password,
          confirmation: "CANCEL SEND",
        });
      const row = data(await call(`${base}/campaigns/${c.id}`)).record;
      if (!row.deletedAt)
        await post(`${base}/campaigns/${c.id}`, {
          action: "archive",
          revision: row.revision,
        });
    }
    sql(
      await db
        .from("newsletter_subscribers")
        .update({ deleted_at: new Date().toISOString() })
        .eq("team_id", team.id),
    );
    sql(
      await db
        .from("newsletter_templates")
        .update({ deleted_at: new Date().toISOString() })
        .eq("team_id", team.id),
    );
    sql(
      await db
        .from("admin_teams")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .eq("id", team.id),
    );
  }
  await h.logout();
  sql(
    await db.from("admin_users").update({ is_active: false }).eq("id", actor),
  );
}
await writeFile(
  new URL("../.docs/phase0/local-newsletter.json", import.meta.url),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      environment:
        "Fictional loopback accounts/team/recipients; local SMTP only; ephemeral signed callback fixture; one subscriber confirms through actual email, a second is explicitly synthetic preconfirmed data. All fixture records archived, no operator records erased.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
console.info(`${evidence.length} actual local newsletter checks passed.`);
