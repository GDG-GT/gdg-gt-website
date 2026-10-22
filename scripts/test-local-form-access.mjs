import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { createTemplate } from "../shared/forms.ts";
import { decryptPayload } from "../server/lib/encryption.mjs";
import { tokenHash } from "../server/lib/security.mjs";
import { deliveryMessage, runDelivery } from "../server/delivery.mjs";
import { serverConfig } from "../server/config.mjs";
const { call, login, db, env, logout } = await localHttp(),
  evidence = [],
  forms = [];
function check(value, name) {
  if (!value) throw new Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS " + name);
}
async function create(access) {
  const f = createTemplate(
    "Fictional access " + access + " " + randomUUID().slice(0, 8),
  );
  const { title, description, fields, sections, settings } = f;
  settings.access = access;
  settings.oneResponse = true;
  let r = await call("/admin/forms", {
    method: "POST",
    body: {
      slug: f.slug,
      definition: { title, description, fields, sections, settings },
    },
  });
  check(r.status === 200, "create " + access + " access fixture");
  let form = r.json.data.form;
  forms.push(form.id);
  r = await call("/admin/forms/" + form.id + "/publish", {
    method: "POST",
    body: { revision: form.revision },
  });
  check(r.status === 200, "publish " + access + " immutable definition");
  return { ...r.json.data.form, fields };
}
async function secret(form) {
  const r = await db
    .from("delivery_jobs")
    .select("*")
    .eq("kind", "form_access")
    .contains("payload", { formId: form.id })
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (r.error) throw new Error("Access job not available");
  const value = decryptPayload(r.data.secret_payload, env.DATA_ENCRYPTION_KEY);
  check(
    !JSON.stringify(r.data.payload).includes(value.token),
    "outbox metadata excludes raw access token",
  );
  return { job: r.data, raw: value.token };
}
await login();
try {
  const invited = await create("invited"),
    path = "/admin/forms/" + invited.id + "/invitations",
    recipient = "fictional-" + randomUUID() + "@example.test";
  let r = await call("/forms/" + invited.slug, { anonymous: true });
  check(
    r.status === 403 && !r.text.includes(invited.title),
    "private form title is concealed without a link",
  );
  const body = {
      type: "invited",
      recipients: [recipient, recipient.toUpperCase()],
      confirmed: true,
    },
    key = randomUUID();
  r = await call(path, {
    method: "POST",
    body: { ...body, confirmed: false },
    key,
  });
  check(r.status === 400, "invitation delivery requires explicit confirmation");
  r = await call(path, { method: "POST", body, key });
  check(
    r.status === 200 && r.json.data.queued === 1,
    "normalized duplicate recipients queue once",
  );
  const id = r.json.data.tokenIds[0];
  r = await call(path, { method: "POST", body, key });
  check(
    r.status === 200 && r.json.data.tokenIds[0] === id,
    "invitation retry returns its committed result",
  );
  r = await call(path, { method: "POST", body, key: randomUUID() });
  check(
    r.status === 200 && r.json.data.queued === 0,
    "a new batch does not resend an active invitation",
  );
  let { job, raw } = await secret(invited);
  const stored = await db
    .from("form_access_tokens")
    .select("*")
    .eq("id", id)
    .single();
  check(
    stored.data.token_hash === tokenHash(raw) &&
      !stored.data.intended_email_encrypted.includes(recipient),
    "access and recipient are stored as a hash and ciphertext",
  );
  r = await call(path);
  check(
    r.status === 200 &&
      !r.text.includes(raw) &&
      !r.text.includes(recipient) &&
      r.json.data.items[0].recipientHint,
    "administrative status list returns only masked recipient hints",
  );
  r = await call("/forms/" + invited.slug, {
    anonymous: true,
    accessToken: raw,
  });
  check(r.status === 200, "the matching private link opens its published form");
  const versionId = r.json.data.form.versionId;
  const other = await create("unlisted");
  r = await call("/forms/" + other.slug, { anonymous: true, accessToken: raw });
  check(r.status === 403, "a private token cannot open a different form");
  r = await call(path + "/" + id, {
    method: "PATCH",
    body: { action: "resend" },
  });
  check(
    r.status === 200,
    "resend rotates the token before queueing a new link",
  );
  check(
    (await deliveryMessage(job, db, serverConfig(env), {
      from: "chapter@example.test",
    })) === null,
    "superseded delivery jobs cannot send old access links",
  );
  r = await call("/forms/" + invited.slug, {
    anonymous: true,
    accessToken: raw,
  });
  check(r.status === 403, "rotation invalidates the previous link immediately");
  ({ raw, job } = await secret(invited));
  const message = await deliveryMessage(job, db, serverConfig(env), {
    from: "chapter@example.test",
  });
  check(
    message.to === recipient && message.text.includes("#access=" + raw),
    "delivery uses a private fragment link and the intended recipient",
  );
  r = await call(path + "/" + id, {
    method: "PATCH",
    body: { action: "resend" },
  });
  check(r.status === 429, "resends enforce a persistent cooldown");
  const answers = {
    [invited.fields[0].id]: "Fictional Invitee",
    [invited.fields[1].id]: recipient,
    [invited.fields[2].id]: invited.fields[2].options[0],
  };
  r = await call("/forms/" + invited.slug + "/submissions", {
    anonymous: true,
    method: "POST",
    key: randomUUID(),
    body: { respondent: { name: "Fictional Invitee", email: recipient }, versionId, answers, accessToken: raw },
  });
  check(
    r.status === 200,
    "an invited respondent commits a response through the private link",
  );
  r = await call("/forms/" + invited.slug, {
    anonymous: true,
    accessToken: raw,
  });
  check(
    r.status === 403,
    "single-use invitations are consumed by final submission",
  );
  r = await call("/admin/forms/" + other.id + "/invitations", {
    method: "POST",
    key: randomUUID(),
    body: { type: "unlisted", recipients: [recipient], confirmed: true },
  });
  check(
    r.status === 200,
    "unlisted delivery creates a separately scoped private capability",
  );
  const unlistedId = r.json.data.tokenIds[0],
    unlistedSecret = await secret(other);
  r = await call("/admin/forms/" + other.id + "/invitations/" + unlistedId, {
    method: "PATCH",
    body: { action: "revoke" },
  });
  check(r.status === 200, "an authorized manager can revoke an unlisted link");
  r = await call("/forms/" + other.slug, {
    anonymous: true,
    accessToken: unlistedSecret.raw,
  });
  check(r.status === 403, "revocation blocks subsequent reads");
  const verified = await create("verified"),
    request = { anonymous: true, method: "POST", body: { email: recipient } };
  const absent = await call(
    "/forms/missing-" + randomUUID() + "/verify",
    request,
  );
  r = await call("/forms/" + verified.slug + "/verify", request);
  check(
    r.status === 200 &&
      JSON.stringify(r.json.data) === JSON.stringify(absent.json.data),
    "verification responses do not disclose form existence or recipient membership",
  );
  const verifiedSecret = await secret(verified);
  r = await call("/forms/" + verified.slug + "/verify", request);
  const counts = await db
    .from("form_access_tokens")
    .select("id", { count: "exact" })
    .eq("form_id", verified.id);
  check(
    r.status === 200 && counts.count === 1,
    "repeated verification requests are debounced in the transaction",
  );
  r = await call("/forms/" + verified.slug, {
    anonymous: true,
    accessToken: verifiedSecret.raw,
  });
  check(
    r.status === 200,
    "verified-email capability opens only its purpose-bound form",
  );
  await db
    .from("form_access_tokens")
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq("form_id", verified.id);
  r = await call("/forms/" + verified.slug, {
    anonymous: true,
    accessToken: verifiedSecret.raw,
  });
  check(r.status === 403, "expired verification links fail closed");
  const delivery = await runDelivery({
    db,
    config: serverConfig(env),
    env,
    limit: 100,
  });
  check(
    delivery.retried === 0 && delivery.lostLease === 0,
    "the local SMTP worker completes current mail jobs without external email",
  );
} finally {
  for (const id of forms) {
    const r = await call("/admin/forms/" + id);
    if (r.status === 200)
      await call("/admin/forms/" + id, {
        method: "DELETE",
        body: { revision: r.json.data.form.revision },
      });
  }
  await logout();
}
await writeFile(
  new URL(
    "../.docs/phase0/local-form-access-integration.json",
    import.meta.url,
  ),
  JSON.stringify(
    {
      note: "Real loopback API, database and local mail capture. Fictional fixtures archived; no external email sent.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
