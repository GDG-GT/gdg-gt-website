import { randomUUID, createECDH, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret, tokenHash } from "../server/lib/security.mjs";
import { runDelivery } from "../server/delivery.mjs";
import { runPushWorker } from "../server/push-worker.mjs";
const h = await localHttp(),
  { db, env, call } = h,
  evidence = [],
  devices = [],
  marker = randomUUID().slice(0, 8);
const sql = (r) => {
  if (r.error) throw Error("Push fixture database error: " + r.error.code);
  return r.data;
};
const data = (r) => {
  if (r.status !== 200)
    throw Error("Push API error: " + r.status + " " + r.json?.error?.code);
  return r.json.data;
};
const check = (ok, name) => {
  if (!ok) throw Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS", name);
};
const anonymous = (path, body) =>
  call(path, { method: "POST", body, anonymous: true });
function device(label) {
  const key = createECDH("prime256v1");
  key.generateKeys();
  const value = {
    endpoint: `https://fcm.googleapis.com/fcm/send/fictional-${marker}-${label}`,
    keys: {
      p256dh: key.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
  devices.push(value);
  return value;
}
let admin, event;
const delivered = [];
try {
  check(
    env.MAIL_MODE === "local" &&
      env.PUSH_ENABLED === "true" &&
      env.PUSH_SEND_ENABLED === "false",
    "push tests require local mail and disabled real push delivery",
  );
  const pending = sql(
    await db
      .from("delivery_jobs")
      .select("id")
      .in("kind", ["event_push_verification", "event_push_reminder"])
      .in("state", ["pending", "running"]),
  );
  if (pending.length)
    throw Error(
      "Resolve earlier synthetic push jobs first; this suite never claims unrelated work.",
    );
  const id = randomUUID(),
    email = `fictional-push-admin-${id}@example.test`,
    password = "Push-fixture-" + randomUUID(),
    client = await localHttp();
  sql(
    await db
      .from("admin_users")
      .insert({
        id,
        email,
        password_hash: await hashSecret(password),
        role: "admin",
        is_active: true,
      }),
  );
  admin = { id, client };
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
  event = data(
    await client.call("/admin/events", {
      method: "POST",
      body: {
        event: {
          title: `Fictional device reminders ${marker}`,
          slug: `fictional-device-reminders-${marker}`,
          description: "Fictional loopback push verification fixture only.",
          start_at: new Date(Date.now() + 3 * 86400000).toISOString(),
          location: "Fictional local fixture",
        },
      },
    }),
  ).event;
  event = data(
    await client.call(`/admin/events/${event.id}/publish`, {
      method: "POST",
      body: { revision: event.revision, event: {} },
    }),
  ).event;
  const registrationEmail = `fictional-push-attendee-${marker}@example.test`;
  const registration = sql(
    await db
      .from("event_attendance")
      .insert({
        event_id: event.id,
        attendee_name: "Fictional push attendee",
        attendee_email: registrationEmail,
        idempotency_key: tokenHash(randomUUID()),
        request_hash: tokenHash(randomUUID()),
      })
      .select("id")
      .single(),
  );
  const settings = data(await call("/push/config", { anonymous: true }));
  check(
    settings.enabled &&
      !settings.deliveryEnabled &&
      settings.publicKey &&
      !JSON.stringify(settings).includes("private"),
    "public configuration exposes readiness and only the VAPID public key",
  );
  const request = { slug: event.slug, email: registrationEmail, website: "" };
  const unknown = data(
    await anonymous("/push/verify-registration", {
      ...request,
      email: `fictional-unregistered-${marker}@example.test`,
    }),
  );
  const known = data(await anonymous("/push/verify-registration", request));
  check(
    JSON.stringify(unknown) === JSON.stringify(known),
    "verification requests do not enumerate registered email addresses",
  );
  const verifications = sql(
    await db
      .from("event_push_verifications")
      .select("id,token_hash")
      .eq("registration_id", registration.id),
  );
  check(
    verifications.length === 1,
    "only an existing matching registration can enqueue verification email",
  );
  const onlyVerification = {
    from: (...args) => db.from(...args),
    rpc: (name, args) =>
      name === "claim_delivery_jobs"
        ? db.rpc("claim_worker_jobs", {
            p_limit: args.p_limit,
            p_kinds: ["event_push_verification"],
          })
        : db.rpc(name, args),
  };
  const mail = await runDelivery({ db: onlyVerification, env, limit: 10 });
  check(
    mail.completed === 1 && !mail.retried,
    "verification is sent through the actual bounded local SMTP pipeline",
  );
  const inbox = await fetch("http://127.0.0.1:54364/api/v1/messages").then(
      (r) => r.json(),
    ),
    letter = inbox.messages.find((m) =>
      m.To?.some((to) => to.Address === registrationEmail),
    );
  if (!letter) throw Error("Synthetic push verification email not captured");
  const detail = await fetch(
      `http://127.0.0.1:54364/api/v1/message/${letter.ID}`,
    ).then((r) => r.json()),
    proof = detail.Text.match(/#reminder=([A-Za-z0-9_-]{43})/)?.[1];
  check(
    !!proof && tokenHash(proof) === verifications[0].token_hash,
    "the actual email contains a private fragment token stored only as a hash",
  );
  check(
    (await anonymous("/push/inspect-verification", { token: "x".repeat(43) }))
      .status === 403,
    "guessed verification capabilities cannot claim a registration",
  );
  check(
    data(await anonymous("/push/inspect-verification", { token: proof }))
      .eventId === event.id,
    "email capability verifies only its own current event registration",
  );
  const a = device("accepted"),
    b = device("expired"),
    c = device("retry"),
    d = device("revoked");
  const body = (subscription) => ({ eventId: event.id, subscription });
  check(
    (await anonymous("/push/subscribe", body(a))).status === 401,
    "anonymous callers cannot invent a subscription owner",
  );
  check(
    (
      await client.call("/push/subscribe", {
        method: "POST",
        body: { ...body(a), userId: id },
      })
    ).status === 400,
    "caller-selected owner identifiers are rejected",
  );
  check(
    (
      await client.call("/push/subscribe", {
        method: "POST",
        body: body({ ...a, endpoint: "https://127.0.0.1/private" }),
      })
    ).status === 400,
    "push endpoints cannot target loopback or arbitrary HTTP services",
  );
  const invalid = Buffer.alloc(65);
  invalid[0] = 4;
  check(
    (
      await client.call("/push/subscribe", {
        method: "POST",
        body: body({
          ...a,
          keys: { ...a.keys, p256dh: invalid.toString("base64url") },
        }),
      })
    ).status === 400,
    "HTTP enrollment rejects invalid elliptic-curve points",
  );
  const subA = data(
    await client.call("/push/subscribe", { method: "POST", body: body(a) }),
  );
  check(subA.subscribed, "current officer session can opt into a public event");
  check(
    data(
      await anonymous("/push/subscribe", {
        ...body(b),
        registrationToken: proof,
      }),
    ).subscribed,
    "a verified attendee can opt into only their registered event",
  );
  for (const subscription of [c, d])
    data(
      await client.call("/push/subscribe", {
        method: "POST",
        body: body(subscription),
      }),
    );
  const records = sql(
    await db
      .from("push_subscriptions")
      .select("id,endpoint_encrypted,admin_user_id,registration_id")
      .eq("event_id", event.id),
  );
  check(
    records.length === 4 &&
      records.every(
        (r) =>
          r.endpoint_encrypted.startsWith("v1.") &&
          !r.endpoint_encrypted.includes("https://") &&
          !r.endpoint_encrypted.includes("p256dh"),
      ),
    "endpoint URLs and browser encryption keys are encrypted at rest",
  );
  check(
    data(await anonymous("/push/status", body(a))).subscribed,
    "the browser's device capability can check its own event opt-in without exposing identity",
  );
  check(
    !data(
      await anonymous(
        "/push/unsubscribe",
        body({
          ...a,
          keys: { ...a.keys, auth: randomBytes(16).toString("base64url") },
        }),
      ),
    ).subscribed && data(await anonymous("/push/status", body(a))).subscribed,
    "a guessed device auth secret cannot revoke another subscription",
  );
  sql(
    await db
      .from("events")
      .update({
        start_at: new Date(Date.now() + 86400000 - 60000).toISOString(),
      })
      .eq("id", event.id),
  );
  check(
    sql(await db.rpc("advance_event_push")).queued === 4,
    "the scheduler creates one bounded reminder per due event and device",
  );
  check(
    sql(await db.rpc("advance_event_push")).queued === 0,
    "the same scheduled occurrence cannot enqueue duplicate reminders",
  );
  data(await anonymous("/push/unsubscribe", body(d)));
  const transport = {
    send: async (subscription, payload) => {
      delivered.push({ endpoint: subscription.endpoint, slug: payload.slug });
      return subscription.endpoint === b.endpoint
        ? 410
        : subscription.endpoint === c.endpoint
          ? 503
          : 201;
    },
  };
  const outcome = await runPushWorker({
    db,
    env: { ...env, PUSH_SEND_ENABLED: "true" },
    transport,
  });
  check(
    outcome.accepted === 1 &&
      outcome.expired === 1 &&
      outcome.retried === 1 &&
      outcome.skipped === 1,
    "leased worker handles acceptance, expiry, transient failure and revoked-device skipping",
  );
  check(
    delivered.length === 3 &&
      delivered.every((r) => r.slug === event.slug) &&
      !delivered.some((r) => r.endpoint === d.endpoint),
    "revoked devices never reach even the synthetic transport",
  );
  const expired = sql(
    await db
      .from("push_subscriptions")
      .select("endpoint_encrypted,revoked_at")
      .eq("event_id", event.id)
      .eq("endpoint_hash", tokenHash(b.endpoint))
      .single(),
  );
  check(
    expired.endpoint_encrypted === null && !!expired.revoked_at,
    "provider 410 disables the expired endpoint and erases its encryption material",
  );
  const ownJobs = sql(
      await db
        .from("push_delivery_log")
        .select("id,state")
        .eq("event_id", event.id),
    ),
    retry = ownJobs.find((r) => r.state === "queued");
  const queued = sql(
    await db
      .from("delivery_jobs")
      .select("id,next_attempt_at")
      .eq("kind", "event_push_reminder")
      .eq("payload->>deliveryId", retry.id)
      .single(),
  );
  check(
    new Date(queued.next_attempt_at) > new Date(),
    "transient push failures use delayed backoff instead of an immediate loop",
  );
  sql(
    await db
      .from("delivery_jobs")
      .update({ next_attempt_at: new Date().toISOString() })
      .eq("id", queued.id),
  );
  const recovered = await runPushWorker({
    db,
    env: { ...env, PUSH_SEND_ENABLED: "true" },
    transport: { send: async () => 201 },
  });
  check(
    recovered.accepted === 1 && !recovered.retried,
    "a retry reuses the existing occurrence and can become provider accepted",
  );
  check(
    !(await db
      .rpc("finish_event_push", {
        p_job: queued.id,
        p_lease: randomUUID(),
        p_result: "accepted",
        p_provider_status: 201,
      })
      .then((r) => sql(r))),
    "a stale worker cannot acknowledge a push delivery",
  );
  data(await anonymous("/push/unsubscribe", body(a)));
  check(
    !data(await anonymous("/push/status", body(a))).subscribed &&
      data(await anonymous("/push/status", body(c))).subscribed,
    "turning off one event/device preserves other owned subscriptions",
  );
  check(
    (
      await runPushWorker({
        db,
        env,
        transport: {
          send: () => {
            throw Error("must never run");
          },
        },
      })
    ).claimed === 0,
    "the actual local delivery switch prevents all real push sends",
  );
  if (process.argv.includes("--hold-for-browser")) {
    if (!process.stdin.isTTY)
      throw Error("Browser hold requires an interactive terminal.");
    console.info(
      "Fictional reminder fixture available for read-only browser review. Marker: " +
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
    for (const subscription of devices)
      await anonymous("/push/unsubscribe", {
        eventId: event.id,
        subscription,
      }).catch(() => undefined);
    if (admin) {
      const current = sql(
        await db.from("events").select("revision").eq("id", event.id).single(),
      );
      data(
        await admin.client.call(`/admin/events/${event.id}`, {
          method: "DELETE",
          body: { revision: current.revision, event: {} },
        }),
      );
    }
  }
  if (admin) {
    await admin.client.logout().catch(() => undefined);
    sql(
      await db
        .from("admin_users")
        .update({ is_active: false })
        .eq("id", admin.id),
    );
  }
}
await writeFile(
  new URL("../.docs/phase0/local-push.json", import.meta.url),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      environment:
        "Fictional loopback event/accounts/cryptographic browser keys; real HTTP, PostgreSQL and SMTP. Push delivery uses an explicit in-process fake transport only; no browser permission or external provider was contacted. Synthetic subscriptions are revoked and their event recoverably archived.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
