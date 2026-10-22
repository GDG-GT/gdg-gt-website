import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
const { db, env } = await localHttp(),
  evidence = [],
  fixture = randomUUID(),
  actor = randomUUID(),
  session = randomUUID(),
  csrf = randomUUID(),
  gate = randomUUID(),
  read = randomUUID(),
  unread = randomUUID(),
  cache = randomUUID(),
  currentCache = randomUUID();
const names = [
    "session-cleanup",
    "notification-cleanup",
    "report-cache-cleanup",
  ],
  occurrence = Math.floor(Date.now() / 86400000);
const checked = (r) => {
  if (r.error)
    throw Error("Retention fixture database failure: " + r.error.code);
  return r.data;
};
const check = (ok, name) => {
  if (!ok) throw Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS", name);
};
async function call(name, extra = {}) {
  const r = await fetch(env.APP_ORIGIN + "/api/v1/jobs/" + name, {
    method: "POST",
    headers: { Authorization: "Bearer " + env.CRON_SECRET, ...extra },
    signal: AbortSignal.timeout(30000),
  });
  return { status: r.status, json: await r.json() };
}
const prior = checked(
    await db
      .from("scheduled_job_runs")
      .select("job_name")
      .in("job_name", names)
      .eq("occurrence", occurrence)
      .eq("state", "completed"),
  ),
  completed = new Set(prior.map((r) => r.job_name));
let made = false;
try {
  if (completed.size === 0) {
    checked(
      await db
        .from("admin_users")
        .insert({
          id: actor,
          email: `fictional-retention-${fixture}@example.test`,
          password_hash: "unusable-fictional-fixture",
          role: "team_member",
          is_active: false,
        }),
    );
    made = true;
    checked(
      await db
        .from("admin_sessions")
        .insert({
          id: session,
          admin_user_id: actor,
          token_hash: randomUUID().replaceAll("-", "").repeat(2),
          idle_expires_at: new Date(Date.now() - 31 * 86400000).toISOString(),
          absolute_expires_at: new Date(
            Date.now() - 30.5 * 86400000,
          ).toISOString(),
        }),
    );
    checked(
      await db
        .from("csrf_tokens")
        .insert({
          id: csrf,
          session_id: session,
          token_hash: randomUUID().replaceAll("-", "").repeat(2),
          expires_at: new Date(Date.now() - 31 * 86400000).toISOString(),
        }),
    );
    checked(
      await db
        .from("gate_sessions")
        .insert({
          id: gate,
          gate_version: 1,
          token_hash: randomUUID().replaceAll("-", "").repeat(2),
          expires_at: new Date(Date.now() - 31 * 86400000).toISOString(),
        }),
    );
    checked(
      await db.from("notifications").insert([
        {
          id: read,
          user_id: actor,
          type: "system",
          title: "Fictional expired read notice",
          message: "Retention fixture only",
          is_read: true,
          created_at: new Date(Date.now() - 91 * 86400000).toISOString(),
        },
        {
          id: unread,
          user_id: actor,
          type: "system",
          title: "Fictional preserved unread notice",
          message: "Retention fixture only",
          is_read: false,
          created_at: new Date(Date.now() - 91 * 86400000).toISOString(),
        },
      ]),
    );
    checked(
      await db.from("finance_report_cache").insert([
        {
          id: cache,
          report_type: "fixture",
          report_data: { fictional: true },
          expires_at: new Date(Date.now() - 60000).toISOString(),
        },
        {
          id: currentCache,
          report_type: "fixture",
          report_data: { fictional: true },
          expires_at: new Date(Date.now() + 3600000).toISOString(),
        },
      ]),
    );
  }
  for (const name of names) {
    check(
      (await call(name, { Origin: env.APP_ORIGIN })).status === 403,
      name + " rejects browser-origin requests",
    );
    check(
      (await call(name + "?days=0")).status === 400,
      name + " rejects caller-selected retention windows",
    );
    const first = await call(name);
    check(
      first.status === 200 &&
        (first.json.data.runId || first.json.data.skipped),
      name +
        " runs through the real authenticated API or reports an already-completed occurrence",
    );
    const again = await call(name);
    check(
      again.status === 200 && again.json.data.skipped === "already_completed",
      name + " deduplicates the current UTC daily occurrence",
    );
  }
  if (made) {
    check(
      checked(await db.from("admin_sessions").select("id").eq("id", session))
        .length === 0 &&
        checked(await db.from("csrf_tokens").select("id").eq("id", csrf))
          .length === 0 &&
        checked(await db.from("gate_sessions").select("id").eq("id", gate))
          .length === 0,
      "actual fictional session, CSRF and gate rows expire after the 30-day boundary",
    );
    check(
      checked(await db.from("notifications").select("id").eq("id", read))
        .length === 0 &&
        checked(await db.from("notifications").select("id").eq("id", unread))
          .length === 1,
      "actual old read notice expires while a 91-day unread notice survives",
    );
    check(
      checked(
        await db.from("finance_report_cache").select("id").eq("id", cache),
      ).length === 0 &&
        checked(
          await db
            .from("finance_report_cache")
            .select("id")
            .eq("id", currentCache),
        ).length === 1,
      "actual expired report cache is removed without deleting a live cache",
    );
  }
  const runs = checked(
    await db
      .from("scheduled_job_runs")
      .select("job_name,state,counts")
      .in("job_name", names)
      .eq("occurrence", occurrence)
      .eq("state", "completed"),
  );
  check(
    runs.length === 3 &&
      runs.every((r) =>
        Object.values(r.counts).every((v) => typeof v === "number"),
      ),
    "daily jobs persist identifier-free numeric outcome counters",
  );
} finally {
  if (made) {
    checked(await db.from("csrf_tokens").delete().eq("id", csrf));
    checked(await db.from("admin_sessions").delete().eq("id", session));
    checked(await db.from("gate_sessions").delete().eq("id", gate));
    checked(await db.from("notifications").delete().in("id", [read, unread]));
    checked(
      await db
        .from("finance_report_cache")
        .delete()
        .in("id", [cache, currentCache]),
    );
  }
}
await writeFile(
  new URL("../.docs/phase0/local-operational-retention.json", import.meta.url),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      note: "Actual loopback HTTP/DB checks. Only invocation-owned fictional records are seeded/removed; no finance evidence, audit history or files are deleted. Repeat within a completed UTC occurrence verifies deduplication, not a fresh mutation.",
      freshFixtureMutation: made,
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
