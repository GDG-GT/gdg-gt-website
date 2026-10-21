import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
const root = await localHttp(), { db, call } = root, actor = randomUUID(), email = `fictional-media-core-${actor}@example.test`, password = "Media-fixture-" + randomUUID(), evidence = [], folders = [];
const check = (ok, name) => { if (!ok) throw Error("FAIL " + name); evidence.push({ name, passed: true }); console.info("PASS", name); };
const sql = (r) => { if (r.error) throw Error("Media fixture failed " + r.error.code); return r.data; };
const data = (r) => { if (r.status !== 200) throw Error("Media API failed " + r.status + " " + r.json?.error?.code); return r.json.data; };
let team;
try {
  sql(await db.from("admin_users").insert({ id: actor, email, password_hash: await hashSecret(password), role: "admin", is_active: true }));
  data(await call("/auth/gate", { method: "POST", body: { code: root.credentials.gateCode } })); data(await call("/auth/login", { method: "POST", body: { email, password } }));
  team = sql(await db.from("admin_teams").insert({ name: "Fictional media core " + actor.slice(0, 8), slug: "media-core-" + actor.slice(0, 8), created_by: actor }).select("id").single());
  check((await call("/admin/media", { anonymous: true })).status === 401, "anonymous media metadata is denied");
  check((await call("/admin/media?path=private/object/key")).status === 400, "object paths cannot be supplied as inventory selectors");
  const base = { name: "Fictional media root", description: "Fixture only", teamId: team.id, parentId: null };
  const first = data(await call("/admin/media/folders", { method: "POST", body: base })); folders.push(first.id);
  check(first.revision === 1, "actual API creates a revisioned scoped media folder");
  check((await call("/admin/media/folders", { method: "POST", body: { ...base, name: "  FICTIONAL MEDIA ROOT  " } })).status === 409, "same-parent duplicate names are rejected case-insensitively");
  check((await call("/admin/media/folders", { method: "POST", body: { ...base, file_path: "forged" } })).status === 400, "folder creation rejects forged storage metadata");
  const child = data(await call("/admin/media/folders", { method: "POST", body: { ...base, name: "Fictional child", parentId: first.id } })); folders.push(child.id);
  const cycle = await call(`/admin/media/folders/${first.id}`, { method: "PATCH", body: { action: "move", revision: 1, parentId: child.id } });
  if (cycle.status !== 409) console.info({ cycleStatus: cycle.status, code: cycle.json?.error?.code });
  check(cycle.status === 409, "folder moves cannot create ancestor cycles");
  check((await call(`/admin/media/folders/${first.id}`, { method: "DELETE", body: { revision: 1 } })).status === 409, "nonempty folders cannot be deleted");
  check((await call(`/admin/media/folders/${first.id}`, { method: "PATCH", body: { action: "update", revision: 99, name: "Stale fixture", description: "Fixture" } })).status === 409, "stale folder revisions are rejected");
  const listing = data(await call(`/admin/media?team=${team.id}&folder=${first.id}`));
  check(listing.folder.id === first.id && listing.folders.length === 1 && listing.folders[0].id === child.id && !JSON.stringify(listing).includes("file_path"), "folder-scoped inventory returns safe metadata rather than storage keys");
  check((await call(`/admin/media?team=chapter&folder=${first.id}`)).status === 404, "mismatched folder and team selectors are concealed");
  const moved = data(await call(`/admin/media/folders/${child.id}`, { method: "PATCH", body: { action: "move", revision: child.revision, parentId: null } }));
  check(moved.revision === 2 && data(await call(`/admin/media?team=${team.id}&folder=${first.id}`)).folders.length === 0, "authorized move updates hierarchy and revision atomically");
  const audit = sql(await db.from("admin_actions").select("metadata").eq("actor_id", actor).like("action", "media.folder_%"));
  check(audit.length >= 3 && !JSON.stringify(audit).includes("Fixture only"), "media mutation audit contains scoped identifiers and revisions, not free-text descriptions");
} finally {
  // Only this script's fictional metadata is archived; no object/file bytes are
  // created or deleted. Move the child first so both folders are empty.
  for (const id of folders.reverse()) {
    const row = sql(await db.from("media_folders").select("revision,deleted_at").eq("id", id).single());
    if (!row.deleted_at) await call(`/admin/media/folders/${id}`, { method: "DELETE", body: { revision: row.revision } });
  }
  if (team) sql(await db.from("admin_teams").update({ is_active: false, deleted_at: new Date().toISOString() }).eq("id", team.id));
  await root.logout(); sql(await db.from("admin_users").update({ is_active: false }).eq("id", actor));
}
await writeFile(new URL("../.docs/phase0/local-media-core.json", import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), environment: "loopback fictional account/team/folders only; no file upload/publication", tests: evidence }, null, 2) + "\n");
console.info(`${evidence.length} actual private-media core checks passed.`);
