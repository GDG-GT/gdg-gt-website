import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
const { call, db, credentials } = await localHttp(),
  id = randomUUID(),
  email = `fictional-task-privacy-${id}@example.test`,
  password = "Fictional-task-privacy-" + randomUUID(),
  evidence = [];
let taskId;
function check(value, name) {
  if (!value) throw new Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS " + name);
}
const inserted = await db
  .from("admin_users")
  .insert({
    id,
    email,
    password_hash: await hashSecret(password),
    role: "team_member",
    display_name: "Fictional privacy review",
    is_active: true,
  });
if (inserted.error) throw new Error("Privacy fixture unavailable");
try {
  await call("/auth/gate", {
    method: "POST",
    body: { code: credentials.gateCode },
  });
  const login = await call("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  if (login.status !== 200)
    throw new Error("Privacy fixture session unavailable " + login.status);
  const denied = [];
  for (const assigneeEmail of [
    credentials.email,
    "unrelated-nonexistent-" + id + "@example.test",
  ]) {
    const r = await call("/admin/communications/tasks", {
      method: "POST",
      key: randomUUID(),
      body: { title: "Fictional forbidden assignment", assigneeEmail },
    });
    denied.push(r);
  }
  check(
    denied.every((r) => r.status === 403 && r.json.error.code === "FORBIDDEN"),
    "unrelated existing and nonexistent private recipients receive the same denial",
  );
  check(
    denied[0].json.error.message === denied[1].json.error.message &&
      denied.every((r) => !r.json.data),
    "recipient existence is not reflected in response text or records",
  );
  const rows = await db
    .from("communication_tasks")
    .select("id", { count: "exact", head: true })
    .eq("assigned_by_id", id);
  check(
    !rows.error && rows.count === 0,
    "denied recipient probes do not create task records",
  );
  let r = await call("/admin/communications/tasks", {
    method: "POST",
    key: randomUUID(),
    body: {
      title: "Fictional Unicode task privacy check",
      description: "漢".repeat(10000),
    },
  });
  check(
    r.status === 200,
    "valid full-length Unicode task descriptions fit the byte-bounded API",
  );
  taskId = r.json.data.id;
  r = await call("/admin/communications/tasks/" + taskId + "/comments", {
    method: "POST",
    key: randomUUID(),
    body: { comment: "語".repeat(5000) },
  });
  check(
    r.status === 200,
    "valid full-length Unicode comments are not incorrectly rejected by byte limits",
  );
  r = await call("/admin/communications/tasks/" + taskId + "/comments");
  check(
    r.status === 200 &&
      r.json.data.items.some((c) => c.comment === "語".repeat(5000)),
    "Unicode comment content round-trips without truncation",
  );
  r = await call("/admin/communications/tasks", {
    method: "POST",
    key: randomUUID(),
    body: { title: "Fictional invalid year", dueDate: "0000-01-01" },
  });
  check(
    r.status === 400,
    "invalid PostgreSQL calendar year is rejected by shared validation",
  );
} finally {
  if (taskId) {
    const current = await call("/admin/communications/tasks/" + taskId);
    if (current.status !== 200)
      throw new Error("Privacy fixture cleanup read failed");
    const task = current.json.data.record;
    const archived = await call("/admin/communications/tasks/" + taskId, {
      method: "POST",
      key: randomUUID(),
      body: {
        action: "archive",
        revision: task.revision,
        confirmation: task.title,
      },
    });
    if (archived.status !== 200)
      throw new Error("Privacy fixture cleanup archive failed");
    await db
      .from("notifications")
      .update({ is_read: true })
      .eq("link", "/admin/communications?tab=tasks&task=" + taskId);
  }
  await call("/auth/session", { method: "DELETE" });
  await db
    .from("admin_users")
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq("id", id);
  await db
    .from("admin_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("admin_user_id", id)
    .is("revoked_at", null);
}
await writeFile(
  new URL(
    "../.docs/phase0/local-task-privacy-integration.json",
    import.meta.url,
  ),
  JSON.stringify(
    {
      note: "Local single-fictional-account recipient privacy and Unicode regression checks. Denials create no tasks; the Unicode task/account are recoverably archived. No rate/scheduler state was reset, and no credentials or email values are recorded.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
