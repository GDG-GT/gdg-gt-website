import { readFile, writeFile, chmod } from "node:fs/promises";
import { parseEnv } from "node:util";
import webPush from "web-push";
import { pushConfig } from "../server/lib/push-transport.mjs";
const file = new URL("../.env.server.local", import.meta.url),
  source = await readFile(file, "utf8"),
  env = parseEnv(source);
if (
  env.NODE_ENV !== "development" ||
  env.APP_ORIGIN !== "http://127.0.0.1:8080" ||
  env.SUPABASE_URL !== "http://127.0.0.1:54361" ||
  env.MAIL_MODE !== "local"
)
  throw Error("Restricted to the dedicated loopback development stack.");
const keys =
    env.PUSH_VAPID_PUBLIC_KEY && env.PUSH_VAPID_PRIVATE_KEY
      ? {
          publicKey: env.PUSH_VAPID_PUBLIC_KEY,
          privateKey: env.PUSH_VAPID_PRIVATE_KEY,
        }
      : webPush.generateVAPIDKeys(),
  values = {
    PUSH_ENABLED: "true",
    PUSH_SEND_ENABLED: "false",
    PUSH_VAPID_PUBLIC_KEY: keys.publicKey,
    PUSH_VAPID_PRIVATE_KEY: keys.privateKey,
    PUSH_VAPID_SUBJECT: "mailto:fictional-push-testing@example.test",
  };
let output = source;
for (const [key, value] of Object.entries(values)) {
  if (env[key] && env[key] !== value)
    throw Error("Existing push settings differ; refusing to overwrite them.");
  if (!env[key]) output += "\n" + key + "=" + value;
}
pushConfig({ ...env, ...values });
if (output !== source) await writeFile(file, output + "\n", { mode: 0o600 });
await chmod(file, 0o600);
console.info(
  "Local VAPID identity prepared in ignored server configuration. Real push delivery remains disabled. Restart the local API; no provider or browser permissions were changed.",
);
