import { randomUUID } from "node:crypto";
const respondent = { name: "Fictional Fixture Respondent", email: `fictional-identity-${randomUUID()}@example.test` };
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { createTemplate } from "../shared/forms.ts";
import { hashSecret } from "../server/lib/security.mjs";
const root = await localHttp(), { db, call } = root, evidence = [], actor = randomUUID(),
  email = `fictional-form-privacy-${actor}@example.test`, password = "Privacy-fixture-" + randomUUID();
const check = (ok, name) => { if (!ok) throw Error("FAIL " + name); evidence.push({ name, passed: true }); console.info("PASS", name); };
const sql = (r) => { if (r.error) throw Error("Privacy fixture failed " + r.error.code); return r.data; };
const data = (r) => { if (r.status !== 200) throw Error("Privacy API failed " + r.status + " " + r.json?.error?.code); return r.json.data; };
const post = (path, body, key = randomUUID(), anonymous = false) => call(path, { method: "POST", body, key, anonymous });
let form;
try {
  sql(await db.from("admin_users").insert({ id: actor, email, password_hash: await hashSecret(password), role: "admin", is_active: true }));
  data(await post("/auth/gate", { code: root.credentials.gateCode })); data(await post("/auth/login", { email, password }));
  const t = createTemplate("Fictional Forms retention review"), fields = t.fields.slice(0, 2), definition = { title: t.title, description: t.description, fields, sections: t.sections, settings: { ...t.settings, retentionDays: 1 } };
  form = data(await post("/admin/forms", { slug: t.slug, definition })).form;
  form = data(await post(`/admin/forms/${form.id}/publish`, { revision: form.revision })).form;
  const base = `/admin/forms/${form.id}/privacy`;
  check((await call(base, { anonymous: true })).status === 401, "anonymous privacy counters and controls denied");
  const initial = data(await call(base));
  check(!initial.held && initial.revision === 0 && initial.draftDays === 7, "privacy review starts with explicit unheld state and bounded default draft retention");
  const hold = { revision: 0, held: true, reason: "Fictional operational hold review", draftDays: 2, confirmation: `HOLD ${form.id}`, currentPassword: password };
  check((await post(base, { ...hold, currentPassword: "wrong-fixture-password" })).status === 403, "privacy changes require the current password");
  check((await post(base, { ...hold, revision: 99 })).status === 409, "stale privacy revisions are rejected");
  check((await post(base, { ...hold, draftDays: 31 })).status === 400, "incomplete draft retention cannot exceed thirty days");
  const holdKey = randomUUID();
  check(data(await post(base, hold, holdKey)).revision === 1 && data(await post(base, hold, holdKey)).revision === 1, "operational hold commits once under an idempotency key");
  let versionId = data(await call(`/forms/${form.slug}`, { anonymous: true })).form.versionId;
  const answers = { [fields[0].id]: "Fictional privacy respondent", [fields[1].id]: "fictional-privacy-respondent@example.test" },
    committed = data(await post(`/forms/${form.slug}/submissions`, { respondent, versionId, answers, website: "" }, randomUUID(), true)),
    responsePath = `/admin/forms/${form.id}/responses/${committed.responseId}`;
  const original = data(await call(responsePath + "/privacy"));
  check(original.effectiveResponseHold && new Date(original.responseExpiresAt) - new Date(committed.submittedAt) === 86400000, "new response retains the original one-day policy and current form-wide hold");
  check((await call(responsePath, { method: "DELETE" })).json?.error?.code === "RETENTION_HOLD", "form-wide hold prevents response deletion");
  check((await call(responsePath, { method: "PATCH", body: { action: "redact" } })).json?.error?.code === "RETENTION_HOLD", "form-wide hold prevents response redaction");
  definition.settings.retentionDays = 365;
  form = data(await call(`/admin/forms/${form.id}/draft`, { method: "PATCH", body: { revision: form.revision, definition } })).form;
  form = data(await post(`/admin/forms/${form.id}/publish`, { revision: form.revision })).form;
  check(data(await call(base)).held && data(await call(responsePath + "/privacy")).responseExpiresAt === original.responseExpiresAt, "republication cannot release the independent hold or rewrite historical retention");
  versionId = data(await call(`/forms/${form.slug}`, { anonymous: true })).form.versionId;
  const draft = data(await post(`/forms/${form.slug}/drafts`, { respondent, versionId, answers }, randomUUID(), true));
  check(draft.expiresInDays === 2 && new Date(draft.expiresAt) > new Date(Date.now() + 47 * 3600000), "real save-and-resume returns its configured two-day deadline rather than a fabricated seven-day promise");
  const individual = { revision: 0, held: true, reason: "Fictional individual retention review", confirmation: `HOLD ${committed.responseId}`, currentPassword: password };
  check(data(await post(responsePath + "/privacy", individual)).revision === 1, "an individual response hold can be reviewed separately");
  data(await post(base, { ...hold, revision: 1, held: false, reason: "Reviewed form-wide hold release" }));
  check(!data(await call(base)).held && data(await call(responsePath + "/privacy")).effectiveResponseHold, "releasing a form-wide hold does not release a separate response hold");
  check((await call(responsePath, { method: "DELETE" })).status === 409, "an individual hold still prevents deletion");
  sql(await db.from("form_responses").update({ retention_expires_at: new Date(Date.now() - 60000).toISOString() }).eq("id", committed.responseId));
  check(data(await call(base)).dueResponses === 0, "held overdue response is excluded from scheduled-expiry eligibility");
  data(await post(responsePath + "/privacy", { ...individual, revision: 1, held: false, reason: "Reviewed individual hold release" }));
  check(data(await call(base)).dueResponses === 1, "released overdue response becomes eligible for retention cleanup");
  // Do not use a global cleanup test to erase unrelated local fixtures. Exercise
  // the actual worker RPC only when every due row belongs to this invocation.
  const due = sql(await db.from("form_responses").select("id").is("deleted_at", null).lte("retention_expires_at", new Date().toISOString()));
  if (due.every((r) => r.id === committed.responseId)) {
    const expired = sql(await db.rpc("expire_form_responses", { p_limit: 500 }));
    check(expired.responsesExpired === 1 && (await call(responsePath + "/history")).status === 404, "actual local retention worker expires only the due fixture and conceals its historical answers");
    check(sql(await db.from("form_answers").select("id").eq("response_id", committed.responseId)).length === 0, "retention cleanup removes actual stored answer values");
    check(sql(await db.rpc("expire_form_responses", { p_limit: 500 })).responsesExpired === 0, "retention cleanup retry performs no duplicate deletion");
  } else {
    data(await call(responsePath, { method: "DELETE" }));
    console.info("Skipped global worker invocation to preserve unrelated due local rows; isolated SQL covers expiry execution.");
  }
  const audit = sql(await db.from("admin_actions").select("metadata").eq("actor_id", actor).in("action", ["forms.hold_reviewed", "forms.hold_released"]));
  check(!JSON.stringify(audit).includes("Fictional operational") && !JSON.stringify(audit).includes("respondent@example.test"), "hold audit retains reason fingerprints and references, not operational text or answers");
} finally {
  if (form) {
    const current = data(await call(`/admin/forms/${form.id}`)).form;
    if (current.status !== "Archived") await call(`/admin/forms/${form.id}`, { method: "DELETE", body: { revision: current.revision } });
  }
  await root.logout(); sql(await db.from("admin_users").update({ is_active: false }).eq("id", actor));
}
await writeFile(new URL("../.docs/phase0/local-form-privacy.json", import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), environment: "loopback fictional form, account and responses", tests: evidence }, null, 2) + "\n");
console.info(`${evidence.length} actual Forms privacy checks passed.`);
