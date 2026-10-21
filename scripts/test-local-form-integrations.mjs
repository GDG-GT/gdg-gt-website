import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { createTemplate } from "../shared/forms.ts";
import { hashSecret } from "../server/lib/security.mjs";
const root = await localHttp(), { db, call } = root, actor = randomUUID(), password = "Fixture-" + randomUUID(),
  email = `fictional-form-integration-${actor}@example.test`, evidence = [];
const check = (ok, name) => { if (!ok) throw Error("FAIL " + name); evidence.push({ name, passed: true }); console.info("PASS", name); };
const sql = (r) => { if (r.error) throw Error("Integration fixture failed " + r.error.code); return r.data; };
const data = (r) => { if (r.status !== 200) throw Error("Integration API failed " + r.status + " " + r.json?.error?.code); return r.json.data; };
const post = (path, body) => call(path, { method: "POST", body });
let form, event, team, campaign;
try {
  sql(await db.from("admin_users").insert({ id: actor, email, password_hash: await hashSecret(password), role: "admin", is_active: true }));
  data(await post("/auth/gate", { code: root.credentials.gateCode })); data(await post("/auth/login", { email, password }));
  const t = createTemplate("Fictional form integration " + actor.slice(0, 8)), definition = { title: t.title, description: t.description, fields: t.fields.slice(0, 2), sections: t.sections, settings: t.settings };
  form = data(await post("/admin/forms", { slug: t.slug, definition })).form;
  event = data(await post("/admin/events", { event: { title: t.title, slug: "form-integration-" + actor.slice(0, 8), description: "Fictional API source", start_at: new Date(Date.now() + 86400000).toISOString(), location: "Local fixture" } })).event;
  const path = `/admin/form-integrations/event/${event.id}`, doc = { revision: 0, formId: form.id, versionPolicy: "latest_published", label: "Open fictional form" },
    put = (body, key = randomUUID()) => call(path + "/primary", { method: "PUT", body, key });
  check((await call(path, { anonymous: true })).status === 401, "anonymous integration metadata is denied");
  check((await call(path + "?definition=true")).status === 400, "integration read rejects unrecognized query projections");
  check((await put(doc)).status === 404, "unpublished form cannot be linked");
  form = data(await post(`/admin/forms/${form.id}/publish`, { revision: form.revision })).form;
  const candidates = data(await call(path + "/candidates?q=" + encodeURIComponent(t.title)));
  check(candidates.length === 1 && candidates[0].id === form.id && !JSON.stringify(candidates).includes("fields"), "candidate search returns only authorized published metadata, not definitions");
  check((await put({ ...doc, versionPolicy: "draft" })).status === 400, "integration policy cannot select a mutable private draft");
  const key = randomUUID(), first = data(await put(doc, key)), retry = data(await put(doc, key));
  check(first.id === retry.id && first.revision === retry.revision, "actual API link retry is idempotent");
  check((await put(doc)).status === 409, "stale integration revision is rejected");
  const refs = data(await call(path));
  check(refs.items.length === 1 && refs.items[0].href === `/forms/${form.slug}` && !JSON.stringify(refs).includes("fields"), "internal integration stores a form reference and latest-published policy only");
  event = data(await post(`/admin/events/${event.id}/publish`, { revision: event.revision, event: {} })).event;
  const publicEvent = data(await call(`/events/${event.slug}`, { anonymous: true })).event;
  check(publicEvent.linked_forms.length === 1 && !JSON.stringify(publicEvent.linked_forms).includes(form.id), "public published event exposes only normal respondent CTA label and URL");
  check(data(await call(`/forms/${form.slug}`, { anonymous: true })).form.versionId, "linked form still loads through its normal respondent API");
  team = sql(await db.from("admin_teams").insert({ name: t.title, slug: "form-team-" + actor.slice(0, 8), created_by: actor }).select("id").single());
  const teamPath = `/admin/form-integrations/team/${team.id}`;
  check((await call(teamPath + "/primary", { method: "PUT", body: doc, key: randomUUID() })).status === 200 && data(await call(teamPath)).items.length === 1, "same integration contract works for a fictional team");
  campaign = sql(await db.from("newsletter_campaigns").insert({ subject: t.title, content: "Fictional draft, never sent", status: "draft", created_by: actor }).select("id").single());
  const campaignPath = `/admin/form-integrations/campaign/${campaign.id}`;
  check((await call(campaignPath + "/primary", { method: "PUT", body: doc, key: randomUUID() })).status === 200, "draft campaign can reference a published form without sending anything");
  sql(await db.from("newsletter_campaigns").update({ status: "scheduled" }).eq("id", campaign.id));
  check((await call(campaignPath + "/primary", { method: "PUT", body: { ...doc, revision: 1 }, key: randomUUID() })).status === 409, "scheduled campaign cannot silently rewrite its form reference");
  sql(await db.from("newsletter_campaigns").update({ status: "failed" }).eq("id", campaign.id));
  definition.settings.access = "invited";
  form = data(await call(`/admin/forms/${form.id}/draft`, { method: "PATCH", body: { revision: form.revision, definition } })).form;
  form = data(await post(`/admin/forms/${form.id}/publish`, { revision: form.revision })).form;
  check(data(await call(`/events/${event.slug}`, { anonymous: true })).event.linked_forms.length === 0, "republication as invite-only immediately removes the public event CTA");
  const removal = data(await call(path + "/primary", { method: "DELETE", body: { revision: first.revision }, key: randomUUID() }));
  check(removal.removed && data(await call(path)).items.length === 0 && data(await call(`/admin/forms/${form.id}`)).form.id === form.id, "removing a source reference does not delete or archive its form");
} finally {
  // Only fictional resources created above are mutated in cleanup.
  if (event) { const current = data(await call(`/admin/events/${event.id}`)).event; data(await call(`/admin/events/${event.id}`, { method: "DELETE", body: { revision: current.revision, event: {} } })); }
  if (form) { const current = data(await call(`/admin/forms/${form.id}`)).form; if (current.status !== "Archived") await call(`/admin/forms/${form.id}`, { method: "DELETE", body: { revision: current.revision } }); }
  if (team) sql(await db.from("admin_teams").update({ is_active: false, deleted_at: new Date().toISOString() }).eq("id", team.id));
  if (campaign) sql(await db.from("newsletter_campaigns").update({ status: "failed" }).eq("id", campaign.id));
  await root.logout(); sql(await db.from("admin_users").update({ is_active: false }).eq("id", actor));
}
await writeFile(new URL("../.docs/phase0/local-form-integrations.json", import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), environment: "loopback fictional form, event, team, campaign and account; no sends", tests: evidence }, null, 2) + "\n");
console.info(`${evidence.length} actual Forms integration checks passed.`);
