import { readFile, writeFile, chmod } from "node:fs/promises";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";
const file = new URL("../.env.server.local", import.meta.url),
  source = await readFile(file, "utf8"),
  env = parseEnv(source);
if (
  env.NODE_ENV !== "development" ||
  env.APP_ORIGIN !== "http://127.0.0.1:8080" ||
  env.SUPABASE_URL !== "http://127.0.0.1:54361"
)
  throw new Error("Restricted to the dedicated loopback development stack.");
const result = spawnSync(
  new URL("../node_modules/.bin/supabase", import.meta.url).pathname,
  ["status", "--workdir", "infra", "--output", "json"],
  {
    encoding: "utf8",
    env: { ...process.env, DOCKER_CONTEXT: "colima-gdg-gt" },
  },
);
if (result.status !== 0) throw new Error("Local stack status unavailable.");
const status = JSON.parse(result.stdout);
if (
  status.API_URL !== env.SUPABASE_URL ||
  typeof status.JWT_SECRET !== "string" ||
  status.JWT_SECRET.length < 32 ||
  !status.PUBLISHABLE_KEY?.startsWith("sb_publishable_")
)
  throw new Error("Local transport configuration is invalid.");
const values = {
  ALLOW_LOCAL_REALTIME_HS256: "true",
  REALTIME_LOCAL_JWT_SECRET: status.JWT_SECRET,
  SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
};
let output = source;
for (const [key, value] of Object.entries(values)) {
  if (env[key] && env[key] !== value)
    throw new Error(
      "Existing local Realtime configuration differs; refusing to overwrite it.",
    );
  if (!env[key]) output += "\n" + key + "=" + value;
}
if (output !== source) await writeFile(file, output + "\n", { mode: 0o600 });
await chmod(file, 0o600);
console.info(
  "Dedicated local Realtime transport configured. Signing material remains in the ignored, server-only file; restart dev:api.",
);
