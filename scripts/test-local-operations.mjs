import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
const root = await localHttp(),
  ordinary = await localHttp(),
  { db, env } = root,
  actor = randomUUID(),
  email = `fictional-monitor-admin-${actor}@example.test`,
  password = "Monitor-fixture-" + randomUUID(),
  evidence = [];
const checked = (r) => {
  if (r.error) throw Error("Monitor fixture database failure: " + r.error.code);
  return r.data;
};
const check = (ok, name) => {
  if (!ok) throw Error("FAIL " + name);
  evidence.push({ name, passed: true });
  console.info("PASS", name);
};
async function report(
  body,
  { origin = env.APP_ORIGIN, type = "application/csp-report", query = "" } = {},
) {
  const response = await fetch(env.APP_ORIGIN + "/api/v1/csp-reports" + query, {
    method: "POST",
    headers: { ...(origin ? { Origin: origin } : {}), "Content-Type": type },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, json: await response.json() };
}
try {
  checked(
    await db
      .from("admin_users")
      .insert({
        id: actor,
        email,
        password_hash: await hashSecret(password),
        role: "admin",
        is_active: true,
      }),
  );
  await root.login();
  check(
    (await root.call("/admin/operations", { anonymous: true })).status === 401,
    "anonymous callers cannot inspect job/alert/retention status",
  );
  checked(
    await ordinary
      .call("/auth/gate", {
        method: "POST",
        body: { code: root.credentials.gateCode },
      })
      .then((r) =>
        r.status === 200 ? { data: true } : { error: { code: r.status } },
      ),
  );
  checked(
    await ordinary
      .call("/auth/login", { method: "POST", body: { email, password } })
      .then((r) =>
        r.status === 200 ? { data: true } : { error: { code: r.status } },
      ),
  );
  check(
    (await ordinary.call("/admin/operations")).status === 403,
    "ordinary Admin cannot read operational monitoring",
  );
  const denied = await ordinary.call(
    "/admin/access?route=%2Fadmin%2Foperations",
  );
  check(
    denied.status === 200 && !denied.json.data.allowed,
    "operations navigation uses server-owned Super Admin eligibility",
  );
  check(
    (await root.call("/admin/operations?email=fictional@example.test"))
      .status === 400,
    "status refuses query-based identity and scope controls",
  );
  const legacy = {
    "csp-report": {
      "effective-directive": "script-src",
      "document-uri":
        "https://example.test/fictional-private-path?token=fictional-private-token",
      "script-sample": "fictional-private-sample",
    },
  };
  check(
    (await report(legacy, { origin: "https://attacker.example.test" }))
      .status === 403,
    "CSP reports reject foreign origins",
  );
  check(
    (await report(legacy, { query: "?debug=true" })).status === 400,
    "CSP endpoint cannot enable debugging through a query",
  );
  check(
    (
      await report({
        "csp-report": { "effective-directive": "unrecognized-directive" },
      })
    ).status === 400,
    "unrecognized report types/directives are rejected",
  );
  const accepted = await report(legacy, {
    type: "application/csp-report; charset=utf-8",
  });
  check(
    accepted.status === 200 &&
      accepted.json.data.received &&
      !JSON.stringify(accepted.json).includes("fictional-private"),
    "actual legacy CSP report is acknowledged without reflecting private URLs or source samples",
  );
  check(
    (
      await report(
        [
          {
            type: "csp-violation",
            body: {
              effectiveDirective: "connect-src",
              blockedURL: "https://example.test/fictional-private",
            },
          },
        ],
        { type: "application/reports+json", origin: null },
      )
    ).status === 200,
    "actual Reporting API format works without requiring a browser Origin header",
  );
  check(
    (
      await report(
        Array(11).fill({
          type: "csp-violation",
          body: { effectiveDirective: "script-src" },
        }),
        { type: "application/reports+json" },
      )
    ).status === 400,
    "report batches are bounded to ten items",
  );
  const monitor = await fetch(
      env.APP_ORIGIN + "/api/v1/jobs/operations-monitor",
      {
        method: "POST",
        headers: { Authorization: "Bearer " + env.CRON_SECRET },
        signal: AbortSignal.timeout(30000),
      },
    ),
    result = await monitor.json();
  check(
    monitor.status === 200 && (result.data.runId || result.data.skipped),
    "actual monitor evaluates through a separate authenticated job lease",
  );
  const status = await root.call("/admin/operations");
  check(
    status.status === 200 &&
      status.json.data.lastEvaluatedAt &&
      status.json.data.jobs.some(
        (row) => row.job_name === "operations-monitor",
      ),
    "actual Super Admin status shows persisted monitoring freshness and job outcomes",
  );
  check(
    status.headers.get("cache-control") === "no-store" &&
      !JSON.stringify(status.json).match(
        /fictional-private|lease_token|password_hash|token_hash|monitor-admin.*@/,
      ),
    "operational status is no-store and excludes participant identity, credentials and job capabilities",
  );
} finally {
  await root.logout();
  await ordinary.logout();
  checked(
    await db.from("admin_users").update({ is_active: false }).eq("id", actor),
  );
}
await writeFile(
  new URL("../.docs/phase0/local-operational-monitoring.json", import.meta.url),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      note: "Actual local HTTP/DB checks with fictional report contents and an invocation-owned ordinary Admin. No external alert, mail, provider or deployment enabled.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
