import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { createTemplate } from "../shared/forms.ts";
import { hashSecret } from "../server/lib/security.mjs";
if (process.env.GDG_LOCAL_TEST_SHARED_SESSION === "true") throw Error("Deletion fixture needs independent fictional sessions.");
const root = await localHttp(), second = await localHttp(), ordinary = await localHttp(), { db, call } = root,
  actor = randomUUID(), admin = randomUUID(), password = "Deletion-fixture-" + randomUUID(),
  email = `fictional-form-deletion-${actor}@example.test`, adminEmail = `fictional-form-deletion-admin-${admin}@example.test`, evidence = [];
const check = (ok, name) => { if (!ok) throw Error("FAIL " + name); evidence.push({ name, passed: true }); console.info("PASS", name); };
const sql = (r) => { if (r.error) throw Error("Deletion fixture failed " + r.error.code); return r.data; };
const data = (r) => { if (r.status !== 200) throw Error("Deletion API failed " + r.status + " " + r.json?.error?.code); return r.json.data; };
const post = (path, body, key = randomUUID()) => call(path, { method: "POST", body, key });
let form, purged = false;
try {
  const hash = await hashSecret(password);
  sql(await db.from("admin_users").insert([{ id: actor, email, password_hash: hash, role: "super_admin", is_active: true }, { id: admin, email: adminEmail, password_hash: hash, role: "admin", is_active: true }]));
  for (const [client, address] of [[root, email], [second, email], [ordinary, adminEmail]]) {
    data(await client.call("/auth/gate", { method: "POST", body: { code: root.credentials.gateCode } }));
    data(await client.call("/auth/login", { method: "POST", body: { email: address, password } }));
  }
  const t = createTemplate("Fictional permanent deletion " + actor.slice(0, 8)), definition = { title: t.title, description: "Fictional private definition", fields: t.fields.slice(0, 2), sections: t.sections, settings: { ...t.settings, retentionDays: 1 } };
  form = data(await post("/admin/forms", { slug: t.slug, definition })).form;
  form = data(await post(`/admin/forms/${form.id}/publish`, { revision: form.revision })).form;
  const path = `/admin/forms/${form.id}`, reviewPath = path + "/deletion-review", deletePath = path + "/permanent-deletion";
  check((await call(reviewPath, { anonymous: true })).status === 401, "anonymous deletion review is denied");
  check((await ordinary.call(reviewPath)).status === 404, "ordinary Admin cannot inspect permanent-deletion review");
  check((await call(reviewPath + "?ignoreRetention=true")).status === 400, "review rejects caller-supplied retention waivers");
  check((await post(reviewPath, { revision: form.revision })).json?.error?.code === "FORM_DELETION_BLOCKED", "permanent deletion requires prior recoverable archive");
  const published = data(await call(`/forms/${form.slug}`, { anonymous: true })).form,
    committed = data(await call(`/forms/${form.slug}/submissions`, { anonymous: true, method: "POST", key: randomUUID(), body: { versionId: published.versionId,
      answers: { [t.fields[0].id]: "Fictional deletion respondent", [t.fields[1].id]: "fictional-deletion@example.test" }, website: "" } }));
  data(await call(path, { method: "DELETE", body: { revision: form.revision } }));
  form = data(await call(path)).form;
  check(data(await call(reviewPath)).unexpiredResponses === 1, "review counts the actual original-version retained response");
  check((await post(reviewPath, { revision: form.revision })).status === 409, "archive alone cannot bypass a live response's retention period");
  sql(await db.from("form_responses").update({ retention_expires_at: new Date(Date.now() - 60000).toISOString() }).eq("id", committed.responseId));
  const state = data(await call(reviewPath));
  check(state.retainedResponses === 1 && state.unexpiredResponses === 0 && !JSON.stringify(state).includes("fictional-deletion@example.test"), "deletion counters expose no answer values or respondent email");
  const review = data(await post(reviewPath, { revision: state.revision })), body = { revision: state.revision, reviewId: review.reviewId, reviewToken: review.reviewToken,
    confirmation: `DELETE FORM ${form.id}`, exportWarningAcknowledged: true, currentPassword: password };
  check(new Date(review.expiresAt) > new Date() && review.reviewToken, "eligible archived form receives a short-lived session-bound review");
  check((await post(deletePath, { ...body, currentPassword: "wrong-fictional-password" })).status === 403, "irreversible commit requires the current password");
  check((await second.call(deletePath, { method: "POST", key: randomUUID(), body })).json?.error?.code === "FORM_DELETION_REVIEW", "another valid session cannot use the review capability");
  check((await post(deletePath, { ...body, revision: 99 })).status === 409, "stale form revision cannot pass deletion review");
  const key = randomUUID(), removed = data(await post(deletePath, body, key)); purged = removed.deleted;
  check(removed.deleted && removed.formId === form.id, "actual local HTTP commit permanently erases only the fictional reviewed form");
  const replay = data(await post(deletePath, body, key));
  check(replay.deleted && replay.formId === form.id, "a lost-response retry returns the same deletion result without repeated erasure");
  check((await call(path)).status === 404 && (await call(path + "/versions")).status === 404, "purged draft and immutable-version contents are concealed even from Super Admin");
  check((await call(`/forms/${form.slug}`, { anonymous: true })).status === 404, "the former public respondent URL is unavailable");
  check((await call(path + `/responses/${committed.responseId}/history`)).status === 404, "purged response history is not recoverable through review APIs");
  check((await post(path + "/restore", { revision: state.revision + 1 })).status === 404, "normal restore cannot resurrect permanently deleted content");
  const tombstone = sql(await db.from("forms").select("id,title,draft_definition,permanently_deleted_at").eq("id", form.id).single()),
    versions = sql(await db.from("form_versions").select("id,definition,schema_hash").eq("form_id", form.id)),
    answers = sql(await db.from("form_answers").select("id").eq("response_id", committed.responseId));
  check(tombstone.permanently_deleted_at && tombstone.title === "[Deleted form]" && JSON.stringify(tombstone.draft_definition) === "{}" && versions.every((v) => JSON.stringify(v.definition) === "{}") && answers.length === 0,
    "actual database retains identifier/hash tombstones but no question definitions or answer values");
  const audit = sql(await db.from("admin_actions").select("metadata").eq("action", "forms.permanently_deleted").eq("target_id", form.id));
  check(audit.length === 1 && !JSON.stringify(audit).includes("Fictional deletion respondent"), "one identifier-only permanent-deletion audit survives replay");
} finally {
  if (form && !purged) { const current = await call(`/admin/forms/${form.id}`); if (current.status === 200 && current.json.data.form.status !== "Archived") await call(`/admin/forms/${form.id}`, { method: "DELETE", body: { revision: current.json.data.form.revision } }); }
  await root.logout(); await second.logout(); await ordinary.logout();
  sql(await db.from("admin_users").update({ is_active: false }).in("id", [actor, admin]));
}
await writeFile(new URL("../.docs/phase0/local-form-deletion.json", import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), environment: "fictional loopback form, response and accounts only; no real chapter data erased", tests: evidence }, null, 2) + "\n");
console.info(`${evidence.length} actual Forms permanent-deletion checks passed.`);
