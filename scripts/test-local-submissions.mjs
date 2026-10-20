import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { decryptPayload } from "../server/lib/encryption.mjs";
import { runDelivery } from "../server/delivery.mjs";
import { token, tokenHash } from "../server/lib/security.mjs";
const { call, db, env } = await localHttp();
const evidence = [],
  unique = randomUUID().slice(0, 8),
  email = "newsletter-" + unique + "@example.test";
const check = (yes, name) => {
  if (!yes) throw new Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS " + name);
};
let r = await call("/newsletter/subscriptions", {
  method: "POST",
  body: { email },
  key: randomUUID(),
  anonymous: true,
});
check(
  r.status === 200 && r.json.data.accepted,
  "newsletter request returns a generic accepted response",
);
const subscriber = await db
  .from("newsletter_subscribers")
  .select("id,state,is_active")
  .eq("email", email)
  .single();
check(
  !subscriber.error &&
    subscriber.data.state === "pending" &&
    !subscriber.data.is_active,
  "newsletter is inactive until double opt-in",
);
const job = await db
  .from("delivery_jobs")
  .select("*")
  .eq("kind", "newsletter_confirmation")
  .contains("payload", { subscriberId: subscriber.data.id })
  .single();
check(
  !job.error && !!job.data.secret_payload,
  "confirmation delivery has an encrypted token payload",
);
const raw = decryptPayload(
  job.data.secret_payload,
  env.DATA_ENCRYPTION_KEY,
).token;
const tokenRow = await db
  .from("newsletter_tokens")
  .select("token_hash")
  .eq("subscriber_id", subscriber.data.id)
  .single();
check(
  tokenRow.data.token_hash === tokenHash(raw) &&
    tokenRow.data.token_hash !== raw,
  "newsletter token storage contains the hash, not the raw token",
);
const delivery = await runDelivery({ db, env, limit: 100 });
check(
  delivery.retried === 0 && delivery.completed >= 1,
  "durable mail jobs deliver into the local mail catcher",
);
const messages = await fetch("http://127.0.0.1:54364/api/v1/messages").then(
  (r) => r.json(),
);
check(
  messages.messages.some((m) => m.To?.some((to) => to.Address === email)),
  "confirmation email is captured locally",
);
r = await call("/newsletter/confirm", {
  method: "POST",
  body: { token: raw },
  anonymous: true,
});
check(r.status === 200, "confirmation token activates the subscription");
r = await call("/newsletter/confirm", {
  method: "POST",
  body: { token: raw },
  anonymous: true,
});
check(r.status === 410, "consumed confirmation token cannot be replayed");
const activeResponse = await call("/newsletter/subscriptions", {
  method: "POST",
  body: { email },
  key: randomUUID(),
  anonymous: true,
});
check(
  activeResponse.status === 200 &&
    JSON.stringify(activeResponse.json.data) ===
      JSON.stringify({
        accepted: true,
        message:
          "If this address needs confirmation, you’ll receive an email with the next step.",
      }),
  "existing-address response does not reveal subscriber state",
);
const unsubscribe = token();
const inserted = await db
  .from("newsletter_tokens")
  .insert({
    subscriber_id: subscriber.data.id,
    purpose: "unsubscribe",
    token_hash: tokenHash(unsubscribe),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
  });
if (inserted.error)
  throw new Error("Could not create test-only unsubscribe token.");
for (let n = 0; n < 2; n++) {
  r = await call("/newsletter/unsubscribe", {
    method: "POST",
    body: { token: unsubscribe },
    anonymous: true,
  });
  check(r.status === 200, "unsubscribe is safe to repeat: " + (n + 1));
}
const contact = {
    name: "Fictional Test Person",
    email: "contact-" + unique + "@example.test",
    type: "general",
    message: "A fictional integration test inquiry. No response is needed.",
    interests: [],
    website: "",
  },
  key = randomUUID();
r = await call("/contact", {
  method: "POST",
  body: contact,
  key,
  anonymous: true,
});
check(
  r.status === 200,
  "contact submission is committed through the public API",
);
r = await call("/contact", {
  method: "POST",
  body: contact,
  key,
  anonymous: true,
});
check(r.status === 200, "contact retry is idempotent");
r = await call("/contact", {
  method: "POST",
  body: { ...contact, message: "Different content for the same key." },
  key,
  anonymous: true,
});
check(r.status === 409, "contact key cannot be reused with changed content");
const records = await db
  .from("contact_submissions")
  .select("id")
  .eq("email", contact.email);
check(
  !records.error && records.data.length === 1,
  "one durable contact record exists after retries",
);
const contactDelivery = await runDelivery({ db, env, limit: 100 });
check(
  contactDelivery.retried === 0 && contactDelivery.completed === 2,
  "contact acknowledgment and chapter notification are locally captured",
);
await writeFile(
  new URL("../.docs/phase0/local-public-submissions.json", import.meta.url),
  JSON.stringify(
    {
      note: "Actual loopback API, PostgreSQL, encrypted queue and Mailpit only. No real provider sends. Fictional test subscriptions and contact records retained.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
