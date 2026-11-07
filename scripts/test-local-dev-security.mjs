import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// This probe never logs or persists response bodies, especially secret files.
const origin = "http://127.0.0.1:8080";
const evidence = [];
for (const [path, expected] of [
  ["/.docs/local-auth.local", 403],
  [
    "/@fs" +
      fileURLToPath(new URL("../.docs/local-auth.local", import.meta.url)),
    403,
  ],
  ["/.env.server.local", 403],
  ["/server/handler.mjs", 403],
  ["/.build/ssr/entry.mjs", 403],
  ["/database/migrations/202610200058_community_members.sql", 403],
  ["/infra/supabase/config.toml", 403],
  ["/", 200],
  ["/src/main.tsx", 200],
  ["/shared/members.mjs", 200],
  ["/assets/hero-campus.webp", 200],
  ["/api/v1/health", 200],
]) {
  const response = await fetch(origin + path, {
    signal: AbortSignal.timeout(10000),
    redirect: "manual",
  });
  await response.body?.cancel();
  assert.equal(
    response.status,
    expected,
    "Unexpected development-file policy: " + path,
  );
  evidence.push({ path, status: response.status, passed: true });
  console.info("PASS", path, response.status);
}
await writeFile(
  new URL("../.docs/phase0/local-dev-file-security.json", import.meta.url),
  JSON.stringify(
    {
      note: "Loopback development-file policy; no response contents retained.",
      tests: evidence,
    },
    null,
    2,
  ) + "\n",
);
