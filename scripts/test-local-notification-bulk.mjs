import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
const root = await localHttp(), { db, call } = root, evidence = [];
const check = (ok, name) => { if (!ok) throw Error("FAIL " + name); evidence.push({ name, passed: true }); console.info("PASS", name); };
const data = (r) => { if (r.status !== 200) throw Error("Inbox API failed " + r.status + " " + r.json?.error?.code); return r.json.data; };
const actor = randomUUID(), foreign = randomUUID(), own = randomUUID(), other = randomUUID(), newer = randomUUID(),
  email = `fictional-bulk-inbox-${actor}@example.test`, password = "Inbox-fixture-" + randomUUID();
const inserted = await db.from("admin_users").insert([
  { id: actor, email, password_hash: await hashSecret(password), role: "team_member", is_active: true },
  { id: foreign, email: `fictional-other-inbox-${foreign}@example.test`, password_hash: "disabled-fixture", role: "team_member", is_active: false },
]);
if (inserted.error) throw Error("Inbox fixture setup failed");
try {
  data(await call("/auth/gate", { method: "POST", body: { code: root.credentials.gateCode } }));
  data(await call("/auth/login", { method: "POST", body: { email, password } }));
  const added = await db.from("notifications").insert([
    { id: own, user_id: actor, type: "system", title: "Fictional unread", message: "Test only", is_read: false },
    { id: other, user_id: foreign, type: "system", title: "Other inbox", message: "Test only", is_read: true },
  ]);
  if (added.error) throw Error("Notification fixtures failed");
  check((await call("/admin/notifications", { anonymous: true, method: "DELETE", body: { readOnly: true } })).status === 401, "anonymous bulk dismissal denied");
  check((await call("/admin/notifications", { method: "DELETE", body: { readOnly: false, userId: foreign } })).status === 400, "bulk dismissal rejects recipient substitution and unread deletion");
  data(await call("/admin/notifications", { method: "PATCH", body: { is_read: true } }));
  check(data(await call("/admin/notifications")).unreadCount === 0, "mark all read reaches zero unread for the signed-in account");
  const addedLater = await db.from("notifications").insert({ id: newer, user_id: actor, type: "system", title: "New unread after read all", message: "Keep this notification", is_read: false });
  if (addedLater.error) throw Error("New notification fixture failed");
  data(await call("/admin/notifications", { method: "DELETE", body: { readOnly: true } }));
  const after = data(await call("/admin/notifications"));
  check(after.total === 1 && after.items[0].id === newer && after.unreadCount === 1, "dismiss all removes read items and preserves a concurrently arrived unread item");
  const foreignRow = await db.from("notifications").select("id").eq("id", other).maybeSingle();
  check(!foreignRow.error && foreignRow.data?.id === other, "bulk dismissal leaves another account's notifications unchanged");
  data(await call("/admin/notifications", { method: "PATCH", body: { is_read: true } }));
  data(await call("/admin/notifications", { method: "DELETE", body: { readOnly: true } }));
  check(data(await call("/admin/notifications")).total === 0, "read-all then dismiss-all leaves a genuine empty inbox");
  check((await call("/admin/notifications", { method: "DELETE", body: { readOnly: true } })).status === 200, "repeating dismissal of an empty inbox is safe");
} finally {
  await root.logout();
  await db.from("notifications").delete().in("user_id", [actor, foreign]);
  await db.from("admin_users").update({ is_active: false }).in("id", [actor, foreign]);
}
await writeFile(new URL("../.docs/phase0/local-notification-bulk.json", import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), environment: "dedicated loopback fictional inboxes", tests: evidence }, null, 2) + "\n");
