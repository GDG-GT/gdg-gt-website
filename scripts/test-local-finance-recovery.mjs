import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { createInterface } from "node:readline";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
if (process.env.GDG_LOCAL_TEST_SHARED_SESSION === "true")
  throw Error("Requires isolated fictional sessions.");
if (process.argv.includes("--hold-for-browser") && !process.stdin.isTTY)
  throw Error("Browser review requires an interactive terminal.");
const { call, db, credentials } = await localHttp(),
  actorId = randomUUID(),
  email = `fictional-finance-recovery-${actorId}@example.test`,
  password = "Fictional-finance-recovery-" + randomUUID(),
  base = "/admin/finances",
  tests = [];
const ledger = new URL("../.docs/local-finance-review.local", import.meta.url);
let requestId,
  ledgerOwned = false;
function check(value, name) {
  if (!value) throw Error("FAIL " + name);
  tests.push({ name, passed: true });
  console.info("PASS " + name);
}
function data(r) {
  if (r.status !== 200)
    throw Error(
      "Fictional recovery request failed " +
        r.status +
        " " +
        (r.json?.error?.code || "unavailable"),
    );
  return r.json.data;
}
const post = (path, body, key = randomUUID()) =>
  call(path, { method: "POST", body, key });
async function evidence(cleanedUp) {
  await writeFile(
    new URL("../.docs/phase0/local-finance-recovery.json", import.meta.url),
    JSON.stringify(
      {
        note: "Dedicated loopback-only private draft/retry/revision checks. No payment, provider send, quota reset or permanent deletion. Fictional financial records and audit entries remain retained.",
        cleanup: { completed: cleanedUp },
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
const seeded = await db
  .from("admin_users")
  .insert({
    id: actorId,
    email,
    password_hash: await hashSecret(password),
    role: "team_member",
    display_name: "Fictional finance draft reviewer",
    is_active: true,
  });
if (seeded.error) throw Error("Finance recovery fixture unavailable");
try {
  data(await post("/auth/gate", { code: credentials.gateCode }));
  data(await post("/auth/login", { email, password }));
  const record = {
      transactionType: "expense",
      category: "Event Costs",
      amount: "12.34",
      description:
        "Fictional finance draft review; no real expense or payment.",
      transactionDate: "2026-10-27",
    },
    key = randomUUID();
  const result = data(await post(base, { record }, key));
  requestId = result.id;
  check(
    data(await post(base, { record }, key)).id === requestId,
    "private draft create retry returns the original record",
  );
  let current = data(await call(base + "/" + requestId)).record;
  check(
    current.amount === "12.34" &&
      current.status === "draft" &&
      current.createdBy === actorId,
    "protected draft projection preserves exact cents, state and ownership",
  );
  const edit = {
      action: "update",
      revision: current.revision,
      record: { ...record, description: record.description + " Updated once." },
    },
    editKey = randomUUID();
  data(await post(base + "/" + requestId, edit, editKey));
  check(
    data(await post(base + "/" + requestId, edit, editKey)).id === requestId,
    "uncertain draft update retry remains idempotent after revision advance",
  );
  const stale = await post(base + "/" + requestId, {
    ...edit,
    record: { ...record, description: "Fictional stale edit" },
  });
  check(
    stale.status === 409,
    "a fresh intent with an obsolete revision cannot overwrite the accepted draft",
  );
  current = data(await call(base + "/" + requestId)).record;
  check(
    current.revision === 2 &&
      current.amount === "12.34" &&
      current.description === edit.record.description,
    "accepted draft survives the rejected stale update unchanged",
  );
  const inventory = data(await call(base + "?page=1"));
  check(
    inventory.total === 1 && inventory.items[0].id === requestId,
    "isolated ordinary member inventory contains only its own private draft",
  );
  if (process.argv.includes("--hold-for-browser")) {
    await writeFile(
      ledger,
      JSON.stringify({
        email,
        password,
        requestId,
        reference: current.reference,
      }),
      { mode: 0o600, flag: "wx" },
    );
    ledgerOwned = true;
    await evidence(false);
    console.info("Fictional finance draft ready. Commands: change, done.");
    const input = createInterface({ input: process.stdin });
    for await (const line of input) {
      if (line.trim() === "done") {
        input.close();
        break;
      }
      if (line.trim() === "change") {
        current = data(await call(base + "/" + requestId)).record;
        data(
          await post(base + "/" + requestId, {
            action: "update",
            revision: current.revision,
            record: {
              ...record,
              description: current.description + " Fictional remote update.",
            },
          }),
        );
        check(
          true,
          "independent-session remote draft revision committed for browser conflict review",
        );
      }
    }
  }
} finally {
  if (requestId) {
    const current = data(await call(base + "/" + requestId)).record;
    if (current.status !== "cancelled")
      data(
        await post(base + "/" + requestId, {
          action: "cancel",
          revision: current.revision,
          currentPassword: password,
          confirmation: current.reference,
        }),
      );
  }
  await call("/auth/session", { method: "DELETE" });
  const account = await db
      .from("admin_users")
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq("id", actorId),
    sessions = await db
      .from("admin_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("admin_user_id", actorId)
      .is("revoked_at", null);
  if (account.error || sessions.error)
    throw Error("Finance recovery account cleanup failed");
  if (ledgerOwned) await unlink(ledger);
  if (process.stdin.isTTY) process.stdin.pause();
}
await evidence(true);
