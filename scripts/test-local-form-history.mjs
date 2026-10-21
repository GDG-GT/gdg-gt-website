import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { createTemplate } from "../shared/forms.ts";
import { hashSecret } from "../server/lib/security.mjs";
const root = await localHttp(), { call, db } = root, evidence = [];
const check = (ok, name) => { if (!ok) throw Error("FAIL " + name); evidence.push({ name, passed: true }); console.info("PASS", name); };
const data = (r) => { if (r.status !== 200) throw Error("History request failed " + r.status + " " + r.json?.error?.code); return r.json.data; };
let form, fixtureActor;
try {
  // Independent fixture credentials exercise real login without resetting or
  // consuming the human operator's account quota or sessions.
  fixtureActor = randomUUID();
  const email = `fictional-history-${fixtureActor}@example.test`, password = "History-fixture-" + randomUUID();
  const account = await db.from("admin_users").insert({ id: fixtureActor, email, password_hash: await hashSecret(password), role: "admin", is_active: true, display_name: "Fictional history reviewer" });
  if (account.error) throw Error("History reviewer fixture failed");
  data(await call("/auth/gate", { method: "POST", body: { code: root.credentials.gateCode } }));
  data(await call("/auth/login", { method: "POST", body: { email, password } }));
  const t = createTemplate("Fictional response history verification"), fields = t.fields.slice(0, 2);
  fields[0].label = "Original historical name"; fields[1].sensitive = true;
  const definition = { title: t.title, description: t.description, fields, sections: t.sections, settings: t.settings };
  form = data(await call("/admin/forms", { method: "POST", body: { slug: t.slug, definition } })).form;
  form = data(await call(`/admin/forms/${form.id}/publish`, { method: "POST", body: { revision: form.revision } })).form;
  const versionId = data(await call(`/forms/${form.slug}`, { anonymous: true })).form.versionId;
  const answers = { [fields[0].id]: "Original fictional person", [fields[1].id]: "historical-private@example.test" };
  const committed = data(await call(`/forms/${form.slug}/submissions`, { anonymous: true, method: "POST", key: randomUUID(), body: { versionId, answers, website: "" } }));
  const base = `/admin/forms/${form.id}/responses/${committed.responseId}/history`;
  check((await call(base, { anonymous: true })).status === 401, "anonymous history inventory denied");
  check((await call(`/admin/forms/${randomUUID()}/responses/${committed.responseId}/history`)).status === 404, "response substitution cannot cross form scope");
  check((await call(`${base}/0?sensitive=true&includeToken=true`)).status === 400, "history rejects unknown query controls");
  check(!JSON.stringify(data(await call(base))).includes("Original fictional person"), "revision inventory contains metadata, not answers");
  for (let revision = 0; revision < 2; revision++) {
    data(await call(`/forms/${form.slug}/edits`, { anonymous: true, method: "POST", key: randomUUID(), body: {
      versionId, editToken: committed.editToken, revision, answers: { ...answers, [fields[0].id]: `Updated fictional person ${revision + 1}` },
    } }));
  }
  const list = data(await call(base));
  check(list.total === 3 && list.items.map((r) => r.revision).join() === "2,1,0", "two real respondent edits produce three correctly numbered review revisions");
  const original = data(await call(`${base}/0`));
  check(original.fields[0].label === "Original historical name" && original.fields[0].value === "Original fictional person", "original revision uses immutable-version labels and original answers");
  check(original.fields[1].masked && original.fields[1].value === null, "sensitive history is masked by default");
  check(data(await call(`${base}/1`)).fields[0].value === "Updated fictional person 1", "intermediate history is not off by one");
  check(data(await call(`${base}/2`)).fields[0].value === "Updated fictional person 2", "current revision uses current committed answers");
  check(data(await call(`${base}/0?sensitive=true`)).fields[1].value === "historical-private@example.test", "explicit permitted sensitive history reveal works");
  check((await call(`${base}/3`)).status === 404, "unknown revision is concealed");
  definition.fields[0].label = "Renamed later draft label";
  form = data(await call(`/admin/forms/${form.id}/draft`, { method: "PATCH", body: { revision: form.revision, definition } })).form;
  form = data(await call(`/admin/forms/${form.id}/publish`, { method: "POST", body: { revision: form.revision } })).form;
  check(data(await call(`${base}/0`)).fields[0].label === "Original historical name", "later publication cannot rewrite prior response labels");
  data(await call(`/admin/forms/${form.id}/responses/${committed.responseId}`, { method: "PATCH", body: { action: "redact" } }));
  const redacted = data(await call(`${base}/0?sensitive=true`));
  check(redacted.redacted && !JSON.stringify(redacted).includes("historical-private@example.test") && !JSON.stringify(redacted).includes("Original fictional person"), "redaction removes identity from historical snapshots too");
  const audit = await db.from("admin_actions").select("metadata").eq("target_id", committed.responseId);
  check(!audit.error && !JSON.stringify(audit.data).includes("historical-private@example.test"), "history audits contain references, not historical answers");
  data(await call(`/admin/forms/${form.id}/responses/${committed.responseId}`, { method: "DELETE" }));
  check((await call(`${base}/0?sensitive=true`)).status === 404, "deleted response has no readable historical answers");
} finally {
  if (form) {
    const current = data(await call(`/admin/forms/${form.id}`)).form;
    if (current.status !== "Archived") await call(`/admin/forms/${form.id}`, { method: "DELETE", body: { revision: current.revision } });
  }
  await root.logout();
  if (fixtureActor) {
    const deactivated = await db.from("admin_users").update({ is_active: false }).eq("id", fixtureActor);
    if (deactivated.error) throw Error("History fixture account cleanup failed");
  }
}
await writeFile(new URL("../.docs/phase0/local-form-history-integration.json", import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), environment: "loopback development only", tests: evidence }, null, 2) + "\n");
console.info(`${evidence.length} actual Forms response history checks passed.`);
