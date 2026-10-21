import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";

if (process.env.GDG_LOCAL_TEST_SHARED_SESSION === "true")
  throw Error("This check requires two independent local session jars.");
const first = await localHttp(),
  second = await localHttp(),
  tests = [];
function check(condition, name) {
  assert.ok(condition, name);
  tests.push({ name, passed: true });
  console.info("PASS", name);
}
try {
  const a = await first.login(),
    b = await second.login();
  check(
    /^[a-f0-9]{64}$/.test(a.sessionBinding) &&
      a.sessionBinding !== b.sessionBinding,
    "same-account sign-ins receive distinct non-bearer generation bindings",
  );
  let response = await first.call("/auth/session", {
    sessionBinding: a.sessionBinding,
  });
  check(
    response.status === 200 &&
      response.json.data.sessionBinding === a.sessionBinding,
    "same-session validation preserves the generation binding",
  );
  response = await second.call("/admin/members", {
    sessionBinding: a.sessionBinding,
  });
  check(
    response.status === 409 && response.json.error.code === "SESSION_CHANGED",
    "replacement cookie rejects a prior generation's private read",
  );
  response = await second.call("/auth/session", {
    method: "DELETE",
    sessionBinding: a.sessionBinding,
  });
  check(
    response.status === 409 && response.json.error.code === "SESSION_CHANGED",
    "even valid replacement-session CSRF cannot authorize stale logout intent",
  );
  response = await second.call("/auth/session", {
    sessionBinding: b.sessionBinding,
  });
  check(
    response.status === 200,
    "rejected stale intent leaves the replacement session usable",
  );
  response = await second.call("/auth/session", {
    anonymous: true,
    sessionBinding: b.sessionBinding,
  });
  check(
    response.status === 401,
    "generation binding without a session cookie grants no access",
  );
} finally {
  await first.logout();
  await second.logout();
}
await writeFile(
  new URL("../.docs/phase0/local-session-generation.json", import.meta.url),
  JSON.stringify(
    {
      note: "Two isolated loopback sessions of the configured local account; only test-owned sessions revoked. No passwords, bindings, tokens or private response bodies retained.",
      tests,
    },
    null,
    2,
  ) + "\n",
);
