import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { createInterface } from "node:readline";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
import { runDelivery } from "../server/delivery.mjs";
if (process.argv.includes("--hold-for-browser") && !process.stdin.isTTY)
  throw new Error("Browser review requires an interactive terminal.");
if (process.env.GDG_LOCAL_TEST_SHARED_SESSION === "true")
  throw Error("Requires isolated fictional sessions.");
const { db, env, credentials } = await localHttp(),
  evidence = [],
  tasks = [],
  accounts = [];
const suffix = randomUUID(),
  password = "Fictional-task-only-" + suffix,
  hash = await hashSecret(password),
  path = "/admin/communications/tasks";
let call,
  owner,
  ledgerOwned = false;
const ledger = new URL("../.docs/local-task-review.local", import.meta.url);
async function recordEvidence(cleanedUp) {
  await writeFile(
    new URL("../.docs/phase0/local-tasks-integration.json", import.meta.url),
    JSON.stringify(
      {
        note: "Actual local independent-session HTTP and fenced scheduler/delivery verification. Only new fictional tasks/accounts were used. Notifications contain generic metadata; no external email or credential disclosure.",
        cleanup: { completed: cleanedUp },
        tests: evidence,
      },
      null,
      2,
    ) + "\n",
  );
}
function check(value, name) {
  if (!value) throw new Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS " + name);
}
async function fixture(label, role = "team_member") {
  const id = randomUUID(),
    email = `fictional-task-${label}-${suffix}@example.test`;
  const insert = await db.from("admin_users").insert({
    id,
    email,
    display_name: "Fictional " + label,
    password_hash: hash,
    role,
    is_active: true,
  });
  if (insert.error) throw new Error("Fixture account unavailable");
  accounts.push(id);
  const transport = await localHttp();
  await transport.call("/auth/gate", {
    method: "POST",
    body: { code: credentials.gateCode },
  });
  const r = await transport.call("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  if (r.status !== 200)
    throw new Error("Fixture session unavailable " + r.status);
  return { id, email, call: transport.call };
}
async function get(id, transport = call) {
  const r = await transport(path + "/" + id);
  if (r.status !== 200) throw new Error("Fixture task unavailable " + r.status);
  return r.json.data.record;
}
async function mutate(
  task,
  action,
  extra = {},
  transport = call,
  key = randomUUID(),
) {
  return transport(path + "/" + task.id, {
    method: "POST",
    key,
    body: { action, revision: task.revision, ...extra },
  });
}
async function cron(name, headers = {}) {
  const r = await fetch(env.APP_ORIGIN + "/api/v1/jobs/" + name, {
    method: "POST",
    headers: { Authorization: "Bearer " + env.CRON_SECRET, ...headers },
    signal: AbortSignal.timeout(15000),
  });
  return { status: r.status, json: await r.json() };
}
const occurrence = Math.floor(Date.now() / 900000);
const scheduled = await db
  .from("scheduled_job_runs")
  .select("state,locked_until")
  .eq("job_name", "task-overdue")
  .eq("occurrence", occurrence);
if (scheduled.error) throw new Error("Task scheduler preflight unavailable");
if (
  scheduled.data.some(
    (run) =>
      run.state === "completed" ||
      (run.state === "running" && new Date(run.locked_until) > new Date()),
  )
)
  throw new Error(
    "This overdue-job occurrence is already claimed or complete. Pause local job polling and wait for the next natural 15-minute slot before this suite; no scheduler or rate-limit state was reset.",
  );
try {
  owner = await fixture("review-officer", "super_admin");
  call = owner.call;
  const editor = await fixture("editor", "blog_editor"),
    outsider = await fixture("outsider");
  let r = await call(path, { anonymous: true });
  check(r.status === 401, "task inventory rejects anonymous callers");
  r = await call(path, {
    method: "POST",
    key: randomUUID(),
    body: { title: "Forged task", assigned_by_id: outsider.id },
  });
  check(
    r.status === 400,
    "task creator attribution cannot be supplied by the browser",
  );
  const createKey = randomUUID(),
    body = {
      title: "Fictional task verification " + suffix.slice(0, 8),
      description: "Private fictional task body",
      assigneeEmail: editor.email,
    };
  r = await call(path, { method: "POST", key: createKey, body });
  check(r.status === 200, "administrator creates a private assigned task");
  const id = r.json.data.id;
  tasks.push(id);
  let task = await get(id);
  check(
    task.status === "pending" &&
      task.assigned_to_id === editor.id &&
      task.assigned_by_id === owner.id &&
      task.team_id === null,
    "task defaults preserve server ownership and private scope",
  );
  r = await call(path, { method: "POST", key: createKey, body });
  check(
    r.status === 200 && r.json.data.id === id,
    "repeated create request is idempotent",
  );
  r = await outsider.call(path + "/" + id);
  check(
    r.status === 404,
    "unrelated active account cannot open a private task",
  );
  r = await outsider.call(path + "?scope=all");
  check(
    r.status === 200 && r.json.data.total === 0,
    "unauthorized tasks are excluded before inventory counts",
  );
  r = await editor.call("/admin/access?route=%2Fadmin%2Fcommunications");
  check(
    r.status === 200 && r.json.data.allowed,
    "blog editor receives only the protected own-communications entry",
  );
  r = await editor.call(path + "/" + id);
  check(
    r.status === 200 &&
      r.json.data.record.actions.includes("status") &&
      !r.json.data.record.actions.includes("update"),
    "assignee can update status without editing task ownership or details",
  );
  r = await mutate(
    task,
    "update",
    { record: { title: "Unauthorized rewrite" } },
    editor.call,
  );
  check(
    r.status === 403,
    "ordinary assignee cannot edit manager-owned task metadata",
  );
  const initial = task;
  r = await mutate(task, "status", { status: "in-progress" }, editor.call);
  check(
    r.status === 200,
    "assignee advances a task through a permitted status transition",
  );
  task = await get(id);
  r = await mutate(initial, "status", { status: "completed" });
  check(
    r.status === 409,
    "stale task revision cannot overwrite a newer status",
  );
  r = await mutate(task, "status", { status: "overdue" }, editor.call);
  check(r.status === 400, "only the scheduled worker may mark a task overdue");
  r = await editor.call(path + "/" + id + "/comments", {
    method: "POST",
    key: randomUUID(),
    body: { comment: "Fictional text", user_id: outsider.id },
  });
  check(r.status === 400, "comment attribution cannot be forged");
  const commentKey = randomUUID(),
    commentBody = { comment: "Fictional <b>literal</b> task comment" };
  r = await editor.call(path + "/" + id + "/comments", {
    method: "POST",
    key: commentKey,
    body: commentBody,
  });
  check(r.status === 200, "assignee posts a plain-text task comment");
  const commentId = r.json.data.id;
  r = await editor.call(path + "/" + id + "/comments", {
    method: "POST",
    key: commentKey,
    body: commentBody,
  });
  check(
    r.status === 200 && r.json.data.id === commentId,
    "same comment retry does not duplicate history",
  );
  r = await call(path + "/" + id + "/comments/" + commentId, {
    method: "POST",
    key: randomUUID(),
    body: {
      action: "edit",
      revision: 1,
      comment: "Administrator rewriting someone else",
    },
  });
  check(
    r.status === 403,
    "administrator cannot rewrite another comment author’s text",
  );
  r = await editor.call(path + "/" + id + "/comments/" + commentId, {
    method: "POST",
    key: randomUUID(),
    body: {
      action: "edit",
      revision: 1,
      comment: "Fictional edited task comment",
    },
  });
  check(r.status === 200, "comment author edits with an optimistic revision");
  r = await call(path + "/" + id + "/comments/" + commentId, {
    method: "POST",
    key: randomUUID(),
    body: { action: "delete", revision: 2 },
  });
  check(
    r.status === 200,
    "authorized manager soft-deletes a comment without deleting its history",
  );
  r = await editor.call(path + "/" + id + "/comments");
  check(
    r.status === 200 &&
      !r.json.data.items.some(
        (c) => c.comment === "Fictional edited task comment",
      ) &&
      r.json.data.items.some((c) => c.id === commentId && c.deleted_at),
    "removed comment text is omitted from the projected conversation",
  );
  r = await mutate(task, "assign", {
    assigneeEmail: outsider.email,
    currentPassword: "fictional wrong password",
    confirmation: task.title,
  });
  check(
    r.status === 403,
    "private reassignment requires the correct current password",
  );
  r = await mutate(task, "assign", {
    assigneeEmail: outsider.email,
    currentPassword: password,
    confirmation: task.title,
  });
  check(
    r.status === 200,
    "administrator explicitly reassigns the task after confirming the audience change",
  );
  task = await get(id);
  r = await editor.call(path + "/" + id);
  check(
    r.status === 404,
    "former assignee loses private task and comment access on the next request",
  );
  r = await outsider.call(path + "/" + id);
  check(r.status === 200, "new assignee receives only the assigned task scope");
  r = await outsider.call(path, {
    method: "POST",
    key: randomUUID(),
    body: {
      title: "Fictional forbidden private assignment",
      assigneeEmail: editor.email,
    },
  });
  check(
    r.status === 403,
    "ordinary member cannot assign a personal task to another account",
  );
  r = await outsider.call(path, {
    method: "POST",
    key: randomUUID(),
    body: { title: "Fictional personal task " + suffix.slice(0, 8) },
  });
  check(r.status === 200, "ordinary member can create their own private task");
  tasks.push(r.json.data.id);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  r = await mutate(task, "update", {
    record: {
      title: task.title,
      description: task.description,
      dueDate: yesterday,
      priority: "high",
      tags: ["fictional"],
    },
  });
  check(r.status === 200, "authorized manager sets a date-only deadline");
  task = await get(id);
  check(
    task.due_date === yesterday,
    "deadline round-trip does not shift the date through a timezone",
  );
  r = await cron("task-overdue", { Origin: env.APP_ORIGIN });
  check(
    r.status === 403,
    "scheduled overdue endpoint rejects browser origins even with the job key",
  );
  r = await cron("task-overdue");
  check(
    r.status === 200 && r.json.data.runId && r.json.data.counts.marked >= 1,
    "real authenticated scheduled job marks due tasks overdue",
  );
  const overdue = await get(id);
  check(
    overdue.status === "overdue" && overdue.revision === task.revision + 1,
    "scheduled deadline transition is revisioned and visible through the API",
  );
  r = await cron("task-overdue");
  check(
    r.status === 200 &&
      ["already_completed", "busy"].includes(r.json.data.skipped),
    "retrying the same scheduler occurrence does not duplicate work",
  );
  const delivery = await runDelivery({ db, env, limit: 100 });
  check(
    delivery.retried === 0 && delivery.lostLease === 0,
    "durable task-notice jobs complete through the actual fenced delivery worker",
  );
  const notices = await db
    .from("notifications")
    .select("user_id,title,message,link")
    .eq("link", "/admin/communications?tab=tasks&task=" + id);
  check(
    !notices.error &&
      notices.data.length === 2 &&
      notices.data.every((n) => n.user_id === outsider.id),
    "current assignee receives assignment and overdue notices; stale former-recipient jobs are skipped",
  );
  check(
    notices.data.every(
      (n) =>
        !n.title.includes(task.title) && !n.message.includes(task.description),
    ),
    "task-notice bodies contain no private task text",
  );
  await runDelivery({ db, env, limit: 100 });
  const duplicate = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("link", "/admin/communications?tab=tasks&task=" + id);
  check(
    duplicate.count === 2,
    "delivery retry does not duplicate assignment or overdue notifications",
  );
  r = await mutate(overdue, "archive", { confirmation: "wrong title" });
  check(r.status === 400, "recoverable task archive requires its exact title");
  r = await mutate(overdue, "archive", { confirmation: overdue.title });
  check(r.status === 200, "task archive is recoverable and revision checked");
  task = await get(id);
  r = await outsider.call(path + "/" + id + "/comments", {
    method: "POST",
    key: randomUUID(),
    body: { comment: "Must not be posted to archive" },
  });
  check(r.status === 404, "archived tasks reject new comments");
  r = await mutate(task, "restore", { confirmation: task.title });
  check(
    r.status === 200,
    "authorized manager restores the original task scope",
  );
  if (process.argv.includes("--hold-for-browser")) {
    await recordEvidence(false);
    await writeFile(
      ledger,
      JSON.stringify({
        email: owner.email,
        password,
        taskId: id,
        title: task.title,
      }),
      { mode: 0o600, flag: "wx" },
    );
    ledgerOwned = true;
    console.info("Browser review task: " + task.title);
    console.info(
      "Commands: change, done. Only this fictional task is affected.",
    );
    const input = createInterface({ input: process.stdin });
    for await (const command of input) {
      if (command.trim() === "done") {
        input.close();
        break;
      }
      if (command.trim() === "change") {
        task = await get(id);
        const changed = await mutate(task, "update", {
          record: {
            title: task.title,
            description: task.description + "\nFictional remote update.",
            dueDate: task.due_date,
            priority: task.priority,
            tags: task.tags,
          },
        });
        check(
          changed.status === 200,
          "browser review remote task update committed",
        );
      }
    }
  }
} finally {
  for (const id of tasks) {
    const task = await get(id);
    if (!task.archived_at) {
      const archived = await mutate(task, "archive", {
        confirmation: task.title,
      });
      if (archived.status !== 200)
        throw new Error("Task fixture cleanup failed " + archived.status);
    }
    const notices = await db
      .from("notifications")
      .update({ is_read: true })
      .eq("link", "/admin/communications?tab=tasks&task=" + id);
    if (notices.error) throw Error("Task fixture notice cleanup failed");
  }
  for (const id of accounts) {
    const account = await db
      .from("admin_users")
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (account.error) throw Error("Task fixture account cleanup failed");
    const sessions = await db
      .from("admin_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("admin_user_id", id)
      .is("revoked_at", null);
    if (sessions.error) throw Error("Task fixture session cleanup failed");
  }
  if (call) await call("/auth/session", { method: "DELETE" });
  if (ledgerOwned) await unlink(ledger);
  if (process.stdin.isTTY) process.stdin.pause();
}
await recordEvidence(true);
