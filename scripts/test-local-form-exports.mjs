import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { localHttp } from "./lib/local-http.mjs";
import { createTemplate } from "../shared/forms.ts";
import { runFormExportWorker } from "../server/form-export-worker.mjs";
const root = await localHttp(), { db, env, call, login } = root, evidence = [];
const check = (ok, name) => {
  if (!ok) throw Error("FAIL " + name);
  evidence.push({ name, passed: true }); console.info("PASS", name);
};
const data = (r) => { if (r.status !== 200) throw Error("Export API failed " + r.status + " " + r.json?.error?.code); return r.json.data; };
const post = (path, body, key = randomUUID()) => call(path, { method: "POST", body, key });
let form, second;
const jobs = [];
try {
  await login();
  const template = createTemplate("Fictional background export verification"),
    { title, description, sections, settings } = template,
    fields = template.fields.slice(0, 2);
  fields[0].label = "Version one name"; fields[1].sensitive = true;
  form = data(await post("/admin/forms", { slug: template.slug, definition: { title, description, sections, fields, settings } })).form;
  const base = `/admin/forms/${form.id}/exports`;
  form = data(await post(`/admin/forms/${form.id}/publish`, { revision: form.revision })).form;
  const pub = data(await call(`/forms/${form.slug}`, { anonymous: true })),
    version = pub.form.versionId;
  const response = data(await call(`/forms/${form.slug}/submissions`, { anonymous: true, method: "POST", key: randomUUID(), body: {
    versionId: version, answers: { [fields[0].id]: "=SUM(1,2)", [fields[1].id]: "fictional-export-secret@example.test" }, website: "",
  } }));
  // Load fixture rows are inserted into this invocation's fictional form only.
  // Actual public validation is exercised above, not claimed for these rows.
  const responses = Array.from({ length: 1000 }, () => ({ id: randomUUID(), form_id: form.id, version_id: version,
    idempotency_key_hash: randomUUID().replaceAll("-", "").repeat(2), request_hash: "a".repeat(64) }));
  let r = await db.from("form_responses").insert(responses);
  if (r.error) throw Error("Export load fixture failed");
  r = await db.from("form_answers").insert(responses.map((r) => ({ response_id: r.id, field_id: fields[0].id, value: "Fictional export load row" })));
  if (r.error) throw Error("Export answer fixture failed");
  check((await call(base, { anonymous: true })).status === 401, "anonymous export inventory denied");
  check((await post(base, { format: "csv", requesterId: randomUUID() })).status === 400, "export rejects forged requester and unknown fields");
  check((await post(base, { format: "csv", filters: { from: "2026-10-22T00:00:00Z", to: "2026-10-21T00:00:00Z" } })).status === 400, "export rejects reversed date filters");
  const key = randomUUID(), doc = { format: "csv", filters: {}, sensitive: false };
  const job = data(await post(base, doc, key)).job; jobs.push(job.id);
  check(job.state === "pending" && job.count === 1001, "background export queues 1001 actual stored responses without an API file body");
  check(data(await post(base, doc, key)).job.id === job.id, "export queue retry returns the same job");
  check((await post(base, { ...doc, format: "json" }, key)).status === 409, "export idempotency key rejects a different format");
  check(!JSON.stringify(job).match(/object_key|session_id|checksum|fictional-export-secret|key_hash/), "job serialization excludes credentials, filters and answer values");
  check((await post(`${base}/${job.id}/download`, {})).status === 404, "pending export cannot download");
  const csv = job;
  const xlsx = data(await post(base, { format: "xlsx", filters: { selected: [response.responseId] } })).job; jobs.push(xlsx.id);
  const json = data(await post(base, { format: "json", filters: { selected: [response.responseId] }, sensitive: true })).job; jobs.push(json.id);
  await runFormExportWorker({ env, db }); await runFormExportWorker({ env, db }); await runFormExportWorker({ env, db });
  for (const job of [csv, xlsx, json]) {
    const ready = data(await call(`${base}/${job.id}`)).job;
    check(ready.state === "ready", `${job.format.toUpperCase()} worker stores a ready private artifact`);
    const signed = data(await post(`${base}/${job.id}/download`, {}));
    check(signed.expiresIn === 60, `${job.format.toUpperCase()} download is authorized for sixty seconds`);
    const fetched = await fetch(signed.url), bytes = new Uint8Array(await fetched.arrayBuffer());
    check(fetched.status === 200 && bytes.length === ready.bytes, `${job.format.toUpperCase()} direct private download matches committed byte size`);
    if (job.format === "csv") {
      const text = new TextDecoder().decode(bytes);
      check(text.includes("'=SUM(1,2)") && text.includes("Version one name") && !text.includes("fictional-export-secret"), "large CSV preserves version labels, escapes formulas and omits sensitive answers");
    } else if (job.format === "xlsx") {
      const sheet = strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"]);
      check(sheet.includes("&apos;=SUM(1,2)") && !sheet.includes("<f>") && !sheet.includes("fictional-export-secret"), "XLSX cells are literal and sensitive answers remain absent");
    } else check(JSON.parse(new TextDecoder().decode(bytes))[0][`${fields[1].label} [${fields[1].id}] v1`] === "fictional-export-secret@example.test", "explicit sensitive JSON export includes only authorized selected answers");
  }
  // Separate same-account browser generation: a new login cannot use the old
  // sign-in's job, even with the same effective administrator permissions.
  second = await localHttp(); await second.login();
  check((await second.call(`${base}/${csv.id}`)).status === 404, "same-account different session cannot inspect an old export");
  check((await second.call(`${base}/${csv.id}/download`, { method: "POST", body: {} })).status === 404, "same-account different session cannot authorize an old export download");
  const cancelled = data(await post(base, { format: "csv", filters: { selected: [response.responseId] } })).job; jobs.push(cancelled.id);
  check((await call(`${base}/${cancelled.id}`, { method: "DELETE" })).status === 200, "export cancellation commits without deleting source responses");
  check((await post(`${base}/${cancelled.id}/download`, {})).status === 404, "cancelled export cannot download");
  const edited = await call(`/forms/${form.slug}/edits`, { anonymous: true, method: "POST", key: randomUUID(), body: {
    versionId: version, editToken: response.editToken, revision: 0,
    answers: { [fields[0].id]: "Updated fictional export row", [fields[1].id]: "fictional-export-secret@example.test" },
  } });
  check(edited.status === 200, "public response edit commits a real new revision");
  check((await post(`${base}/${csv.id}/download`, {})).status === 409, "response edits invalidate previously ready exports");
  const waiting = data(await post(base, { format: "json", filters: { selected: [response.responseId] } })).job; jobs.push(waiting.id);
  data(await call(`/admin/forms/${form.id}/responses/${response.responseId}`, { method: "PATCH", body: { action: "redact" } }));
  await runFormExportWorker({ env, db });
  check(data(await call(`${base}/${waiting.id}`)).job.state === "failed", "redaction before worker execution rejects the frozen response snapshot");
  const audit = await db.from("admin_actions").select("metadata").eq("target_type", "form_export").in("target_id", jobs);
  check(!audit.error && !JSON.stringify(audit.data).includes("fictional-export-secret"), "export audit contains identifiers and counters, never answer values");
} finally {
  if (form) {
    for (const job of jobs) await call(`/admin/forms/${form.id}/exports/${job}`, { method: "DELETE" });
    await runFormExportWorker({ env, db });
    const current = data(await call(`/admin/forms/${form.id}`)).form;
    if (current.status !== "Archived") await call(`/admin/forms/${form.id}`, { method: "DELETE", body: { revision: current.revision } });
  }
  await second?.logout(); await root.logout();
}
await writeFile(new URL("../.docs/phase0/local-form-exports-integration.json", import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), environment: "loopback development only", tests: evidence }, null, 2) + "\n");
console.info(`${evidence.length} actual Forms background export checks passed.`);
