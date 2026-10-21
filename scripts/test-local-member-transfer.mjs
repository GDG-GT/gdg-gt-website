import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
import { communityMemberRecord } from "../shared/members.mjs";
const root = await localHttp(), { db, call } = root, evidence = [], actor = randomUUID(), team = randomUUID(), otherTeam = randomUUID(), marker = actor.slice(0, 8),
  email = `fictional-transfer-reviewer-${actor}@example.test`, password = "Transfer-fixture-" + randomUUID(), members = [];
const check = (ok, name) => { if (!ok) throw Error("FAIL " + name); evidence.push({ name, passed: true }); console.info("PASS", name); };
const sql = (r) => { if (r.error) throw Error("Member transfer fixture operation failed " + r.error.code); return r.data; };
const data = (r) => { if (r.status !== 200) throw Error("Member transfer API failed " + r.status + " " + r.json?.error?.code); return r.json.data; };
const post = (path, body, key = randomUUID()) => call("/admin/members" + path, { method: "POST", body, key });
let second;
try {
  sql(await db.from("admin_users").insert({ id: actor, email, password_hash: await hashSecret(password), role: "team_member", is_active: true, display_name: "Fictional transfer reviewer" }));
  sql(await db.from("admin_teams").insert([{ id: team, name: "Fictional transfer " + marker, slug: "transfer-" + actor }, { id: otherTeam, name: "Fictional other transfer " + marker, slug: "other-transfer-" + actor }]));
  sql(await db.from("team_memberships").insert({ team_id: team, admin_user_id: actor }));
  sql(await db.from("team_page_access").insert({ team_id: team, page_path: "/admin/members", can_access: true }));
  sql(await db.from("team_permissions").insert({ team_id: team, resource_type: "members", permission: "crud", can_read: true, can_create: true, can_update: true, can_delete: true }));
  const existing = randomUUID(); members.push(existing);
  sql(await db.from("members").insert({ id: existing, name: "Hidden other-scope fixture", email: `existing-${marker}@example.test`, phone: "never-export-outsider-phone", team_id: otherTeam }));
  data(await call("/auth/gate", { method: "POST", body: { code: root.credentials.gateCode } }));
  data(await call("/auth/login", { method: "POST", body: { email, password } }));
  const rows = [
    communityMemberRecord.parse({ name: "=SUM(1,2)", email: `first-${marker}@example.test`, phone: "+123456", major: "Fictional private academic value", interests: ["Web, AI", "Cloud"] }),
    communityMemberRecord.parse({ name: "Fictional second transfer", email: `second-${marker}@example.test`, category: "alumni" }),
    communityMemberRecord.parse({ name: "Do not overwrite existing", email: `existing-${marker}@example.test` }),
  ], document = { teamId: team, rows };
  check((await call("/admin/members/export", { anonymous: true, method: "POST", body: {} })).status === 401, "anonymous member export denied");
  check((await post("/import-preview", { ...document, actorId: actor })).status === 400, "import rejects caller-defined actor authority");
  check((await post("/import-preview", { ...document, teamId: otherTeam })).status === 404, "import cannot target another team's directory");
  check((await post("/import-preview", { ...document, rows: [rows[0], rows[0]] })).status === 400, "duplicate emails in direct API input are rejected");
  const review = data(await post("/import-preview", document));
  check(review.eligible === 2 && review.skippedRows.join() === "3", "preview identifies two new records and one unavailable/existing email without overwriting it");
  check(!JSON.stringify(review).includes("Hidden other-scope") && !JSON.stringify(review).includes("never-export-outsider"), "duplicate preview does not disclose another team's member details");
  const stored = sql(await db.from("member_import_reviews").select("*").eq("id", review.reviewId).single());
  check(!JSON.stringify(stored).includes(rows[0].email) && !JSON.stringify(stored).includes(rows[0].name) && !JSON.stringify(stored).includes(review.reviewToken), "stored import review retains hashes and scope, not raw source contacts or review token");
  const commit = { document, reviewId: review.reviewId, reviewToken: review.reviewToken, confirmation: "IMPORT 2", currentPassword: password };
  check((await post("/import", { ...commit, currentPassword: "wrong-fixture-password" })).status === 403, "bulk import requires the current password");
  check((await post("/import", { ...commit, confirmation: "IMPORT 3" })).status === 400, "bulk import requires the displayed eligible-count confirmation");
  check((await post("/import", { ...commit, document: { ...document, rows: [{ ...rows[0], name: "Changed after preview" }, ...rows.slice(1)] } })).status === 409, "review proof cannot authorize edited file contents");
  second = await localHttp();
  data(await second.call("/auth/gate", { method: "POST", body: { code: root.credentials.gateCode } }));
  data(await second.call("/auth/login", { method: "POST", body: { email, password } }));
  check((await second.call("/admin/members/import", { method: "POST", body: commit, key: randomUUID() })).status === 409, "another sign-in of the same account cannot consume this import review");
  const key = randomUUID(), imported = data(await post("/import", commit, key)); members.push(...imported.createdIds);
  check(imported.created === 2 && imported.skipped === 1 && imported.createdIds.length === 2, "reviewed import atomically commits its eligible new records");
  check(JSON.stringify(data(await post("/import", commit, key))) === JSON.stringify(imported), "retrying a committed import returns the same IDs without duplicates");
  const committed = sql(await db.from("members").select("id,email,team_id,phone,interests").in("id", imported.createdIds));
  check(committed.every((m) => m.team_id === team) && committed.find((m) => m.email === rows[0].email).interests.join("|") === "Web, AI|Cloud", "committed records preserve parsed interests and the explicitly selected team scope");
  const accounts = sql(await db.from("admin_users").select("id").in("email", rows.slice(0, 2).map((r) => r.email))), profiles = sql(await db.from("team_members").select("id").in("email", rows.slice(0, 2).map((r) => r.email)));
  check(accounts.length === 0 && profiles.length === 0, "import creates no login accounts, privileges or public profiles");
  const filters = { q: marker, state: "current" }, minimal = data(await post("/export", { filters }));
  check(minimal.count === 2 && !minimal.csv.includes("@example.test") && !minimal.csv.includes("private academic"), "default export includes all matching own-scope records but omits private fields");
  check(minimal.csv.includes("'=SUM(1,2)"), "CSV export neutralizes spreadsheet formula prefixes");
  const full = data(await post("/export", { filters, includePrivate: true }));
  check(full.count === 2 && full.csv.includes(rows[0].email) && full.csv.includes("'+123456") && !full.csv.includes("never-export-outsider-phone"), "explicit private export preserves authorized contacts while excluding another team's records");
  check(data(await post("/export", { filters: { ...filters, category: "alumni" } })).count === 1, "CSV export applies directory category filters on the server");
  check((await post("/export", { filters: { ...filters, ownerId: actor } })).status === 400, "export rejects forged scope filters");
  sql(await db.from("team_permissions").update({ can_read: false }).eq("team_id", team));
  check((await post("/export", { filters, includePrivate: true })).status === 404, "revoking team read access immediately prevents new private exports");
  const audit = sql(await db.from("admin_actions").select("metadata").eq("actor_id", actor).in("action", ["members.import_reviewed", "members.imported", "members.exported"]));
  check(!JSON.stringify(audit).includes(rows[0].email) && !JSON.stringify(audit).includes("private academic"), "transfer audits contain counts and hashes, not source contacts or academic values");
} finally {
  await second?.logout(); await root.logout();
  if (members.length) sql(await db.from("members").update({ is_active: false, deleted_at: new Date().toISOString() }).in("id", members));
  sql(await db.from("team_memberships").update({ is_active: false }).eq("admin_user_id", actor));
  sql(await db.from("admin_teams").update({ is_active: false }).in("id", [team, otherTeam]));
  sql(await db.from("admin_users").update({ is_active: false }).eq("id", actor));
}
await writeFile(new URL("../.docs/phase0/local-member-transfer.json", import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), environment: "loopback fictional accounts, teams and community records only", tests: evidence }, null, 2) + "\n");
console.info(`${evidence.length} actual community member transfer checks passed.`);
