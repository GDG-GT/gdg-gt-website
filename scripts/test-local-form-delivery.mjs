import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { createTemplate } from "../shared/forms.ts";
import { hashSecret } from "../server/lib/security.mjs";
import { runDelivery, mailConfig } from "../server/delivery.mjs";
const root = await localHttp(), { call, db, env } = root, evidence = [];
if (!mailConfig(env).local) throw Error("This test sends only to the loopback mail sink.");
const check = (ok, name) => { if (!ok) throw Error("FAIL " + name); evidence.push({ name, passed: true }); console.info("PASS", name); };
const data = (r) => { if (r.status !== 200) throw Error("Delivery API failed " + r.status + " " + r.json?.error?.code); return r.json.data; };
const post = (path, body, key = randomUUID()) => call(path, { method: "POST", body, key });
let actor, form;
try {
  actor = randomUUID();
  const email = `fictional-form-delivery-${actor}@example.test`, password = "Delivery-fixture-" + randomUUID();
  const inserted = await db.from("admin_users").insert({ id: actor, email, password_hash: await hashSecret(password),
    role: "admin", is_active: true, display_name: "Fictional delivery reviewer" });
  if (inserted.error) throw Error("Delivery reviewer fixture failed");
  data(await post("/auth/gate", { code: root.credentials.gateCode }));
  data(await post("/auth/login", { email, password }));
  const t = createTemplate("Fictional reviewed delivery verification"), fields = t.fields.slice(0, 2);
  fields[0].label = "Mail-safe name"; fields[1].sensitive = true;
  const definition = { title: t.title, description: t.description, sections: t.sections, fields,
    settings: { ...t.settings, access: "internal", receipts: true, oneResponse: false } };
  form = data(await post("/admin/forms", { slug: t.slug, definition })).form;
  const base = `/admin/forms/${form.id}/delivery`;
  check((await call(base, { anonymous: true })).status === 401, "anonymous delivery settings denied");
  check((await post(`/admin/forms/${form.id}/publish`, { revision: form.revision })).json?.error?.code === "FORM_DELIVERY_REVIEW_REQUIRED", "receipt-enabled publication requires a current review");
  const initial = data(await call(base));
  check(initial.mailReady && initial.revision === 0 && !initial.matchesDraft, "new form has no implicit email approval");
  check(!JSON.stringify(initial).match(/example.test|schema_hash|password_hash|token_hash/), "delivery settings expose candidate identities, not private email addresses or credentials");
  const review = { formRevision: initial.formRevision, policyRevision: initial.revision,
    receipts: true, receiptAnswers: true, notificationUsers: [actor], chapterInbox: false,
    notificationAnswers: true, confirmation: initial.reference, currentPassword: password };
  check((await post(base, { ...review, recipientEmail: "forged@example.test" })).status === 400, "arbitrary email recipients cannot be supplied");
  check((await post(base, { ...review, currentPassword: "incorrect-fixture-password" })).status === 403, "delivery review requires the actual current password");
  check((await post(base, { ...review, formRevision: 999 })).status === 409, "delivery review rejects a stale draft revision");
  const reviewKey = randomUUID();
  check(data(await post(base, review, reviewKey)).revision === 1, "explicit recipient and non-sensitive answer review commits");
  check(data(await post(base, review, reviewKey)).revision === 1, "review retry is idempotent");
  check((await post(base, { ...review, chapterInbox: true }, reviewKey)).status === 409, "review key cannot approve a changed recipient set");
  check(data(await call(base)).matchesDraft, "saved approval matches the exact canonical draft");
  form = data(await post(`/admin/forms/${form.id}/publish`, { revision: form.revision })).form;
  const versionId = data(await call(`/forms/${form.slug}`)).form.versionId;
  const submission = { versionId, answers: { [fields[0].id]: "Fictional email-safe answer", [fields[1].id]: "never-mail-this-answer@example.test" }, website: "" }, key = randomUUID();
  const committed = data(await post(`/forms/${form.slug}/submissions`, submission, key));
  check(data(await post(`/forms/${form.slug}/submissions`, submission, key)).responseId === committed.responseId, "real internal submission retry returns the committed response");
  const deliveries = await db.from("form_response_deliveries").select("id,purpose").eq("response_id", committed.responseId);
  check(!deliveries.error && deliveries.data.length === 2, "one respondent receipt and one explicit chapter notification are queued exactly once");
  const deliveryIds = deliveries.data.map((d) => d.id);
  let jobs;
  for (let attempt = 0; attempt < 6; attempt++) {
    await runDelivery({ db, env, limit: 25 });
    const rows = await db.from("delivery_jobs").select("id,state,provider_message_id,payload").eq("kind", "form_reviewed_email");
    if (rows.error) throw Error("Delivery job verification failed");
    jobs = rows.data.filter((j) => deliveryIds.includes(j.payload.deliveryId));
    if (jobs.length === 2 && jobs.every((j) => j.state === "completed")) break;
  }
  check(jobs.length === 2 && jobs.every((j) => j.state === "completed" && j.provider_message_id), "both durable messages are delivered through actual loopback SMTP");
  check(!JSON.stringify(jobs).includes("never-mail-this-answer") && !JSON.stringify(jobs).includes(email), "outbox payloads contain references, not recipient addresses or answers");
  const messages = await fetch("http://127.0.0.1:54364/api/v1/messages").then((r) => r.json());
  const own = messages.messages.filter((m) => m.To?.some((to) => to.Address === email));
  check(own.length === 2, "local mail sink contains exactly the receipt and authorized notification");
  for (const message of own) {
    const detail = await fetch(`http://127.0.0.1:54364/api/v1/message/${message.ID}`).then((r) => r.json());
    check(detail.Text.includes("Fictional email-safe answer") && !JSON.stringify(detail).includes("never-mail-this-answer"), "actual email includes reviewed non-sensitive answers and excludes sensitive answers");
  }
  definition.title += " revised";
  form = data(await call(`/admin/forms/${form.id}/draft`, { method: "PATCH", body: { revision: form.revision, definition } })).form;
  check(!data(await call(base)).matchesDraft, "editing a saved definition invalidates its review match");
  check((await post(`/admin/forms/${form.id}/publish`, { revision: form.revision })).status === 409, "new receipt-enabled version cannot reuse an older definition approval");
} finally {
  if (form) {
    const current = data(await call(`/admin/forms/${form.id}`)).form;
    if (current.status !== "Archived") await call(`/admin/forms/${form.id}`, { method: "DELETE", body: { revision: current.revision } });
  }
  await root.logout();
  if (actor) {
    const r = await db.from("admin_users").update({ is_active: false }).eq("id", actor);
    if (r.error) throw Error("Delivery fixture cleanup failed");
  }
}
await writeFile(new URL("../.docs/phase0/local-form-delivery-integration.json", import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), environment: "loopback development and local SMTP only", tests: evidence }, null, 2) + "\n");
console.info(`${evidence.length} actual reviewed Forms delivery checks passed.`);
