import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseEnv } from "node:util";
import { command } from "./lib/disposable-postgres.mjs";
import { token, hashSecret, verifySecret } from "../server/lib/security.mjs";
import { serverDatabase } from "../server/db/client.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const envFile = path.join(root, ".env.server.local");
const credentialsFile = path.join(root, ".docs/local-auth.local");
const recoverMissing = process.argv.includes("--recover-missing-account");
if (process.argv.slice(2).some((arg) => arg !== "--recover-missing-account"))
  throw Error("Unknown local auth setup option.");
const exists = async (file) => {
  try {
    await access(file, constants.F_OK);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
};
if (process.env.NODE_ENV === "production")
  throw new Error("Local bootstrap is forbidden in production.");
const result = await command(
  process.env.SUPABASE_CLI || "supabase",
  ["status", "--workdir", "infra", "--output", "json"],
  undefined,
  { env: { ...process.env, DOCKER_CONTEXT: "colima-gdg-gt" } },
);
if (result.code !== 0)
  throw new Error("The dedicated local Supabase stack must be healthy first.");
const status = JSON.parse(result.stdout);
if (status.API_URL !== "http://127.0.0.1:54361")
  throw new Error(
    "Refusing bootstrap: the API is not the dedicated loopback target.",
  );
const serviceKey = status.SECRET_KEY || status.SERVICE_ROLE_KEY;
if (!serviceKey)
  throw new Error(
    "Local status did not provide server authentication material.",
  );
const haveEnv = await exists(envFile),
  haveCredentials = await exists(credentialsFile);
if (recoverMissing && (!haveEnv || !haveCredentials))
  throw Error(
    "Recovery requires the existing private loopback configuration and saved credentials.",
  );
if (haveEnv !== haveCredentials)
  throw new Error(
    "Partial local bootstrap files exist; refusing to overwrite credentials.",
  );
let env, credentials;
if (haveEnv) {
  env = parseEnv(await readFile(envFile, "utf8"));
  credentials = JSON.parse(await readFile(credentialsFile, "utf8"));
  if (
    env.SUPABASE_URL !== status.API_URL ||
    env.SUPABASE_SECRET_KEY !== serviceKey
  )
    throw new Error(
      "Existing local configuration differs; refusing to overwrite it.",
    );
} else {
  credentials = {
    email: "local-admin@example.test",
    password: token(),
    gateCode: token(),
    note: "Random credentials for this loopback-only development database. Never use in staging or production.",
  };
  env = {
    NODE_ENV: "development",
    APP_ORIGIN: "http://127.0.0.1:8080",
    SUPABASE_URL: status.API_URL,
    SUPABASE_SECRET_KEY: serviceKey,
    RISK_HASH_SECRET: token(),
    DATA_ENCRYPTION_KEY: token(),
    ADMIN_GATE_SECRET_HASH: await hashSecret(credentials.gateCode),
    ALLOW_INSECURE_LOCAL_COOKIES: "true",
    MAIL_MODE: "local",
    FROM_EMAIL: "chapter@example.test",
    CHAPTER_CONTACT_EMAIL: "chapter-inbox@example.test",
  };
  const db = serverDatabase(env);
  const { count, error } = await db
    .from("admin_users")
    .select("id", { head: true, count: "exact" });
  if (error || count !== 0)
    throw new Error(
      "Bootstrap requires an empty healthy local admin table; existing accounts will not be changed.",
    );
  await mkdir(path.dirname(credentialsFile), { recursive: true });
  await writeFile(
    envFile,
    Object.entries(env)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n") + "\n",
    { flag: "wx", mode: 0o600 },
  );
  await writeFile(
    credentialsFile,
    JSON.stringify(credentials, null, 2) + "\n",
    { flag: "wx", mode: 0o600 },
  );
}
const db = serverDatabase(env);
const { data: existing, error: readError } = await db
  .from("admin_users")
  .select("id,password_hash,is_active,role")
  .eq("email", credentials.email)
  .maybeSingle();
if (readError)
  throw new Error("Could not inspect the local bootstrap account.");
if (existing) {
  if (
    !existing.is_active ||
    existing.role !== "super_admin" ||
    !(await verifySecret(credentials.password, existing.password_hash))
  ) {
    throw new Error(
      "Existing local account differs from the saved bootstrap; no credentials were reset.",
    );
  }
} else {
  const { count, error } = await db
    .from("admin_users")
    .select("id", { head: true, count: "exact" });
  if (error || (count !== 0 && !recoverMissing))
    throw new Error(
      "Refusing to add a bootstrap admin beside existing accounts.",
    );
  if (recoverMissing && count !== 0) {
    const accounts = await db
        .from("admin_users")
        .select("id", { head: true, count: "exact" })
        .eq("is_active", true),
      sessions = await db
        .from("admin_sessions")
        .select("id", { head: true, count: "exact" })
        .is("revoked_at", null)
        .gt("absolute_expires_at", new Date().toISOString())
        .gt("idle_expires_at", new Date().toISOString());
    if (
      accounts.error ||
      sessions.error ||
      accounts.count !== 0 ||
      sessions.count !== 0
    )
      throw Error(
        "Missing-account recovery requires zero active local accounts and zero unexpired sessions; nothing was changed.",
      );
    if (!(await verifySecret(credentials.gateCode, env.ADMIN_GATE_SECRET_HASH)))
      throw Error(
        "Saved gate does not match the existing local configuration; nothing was changed.",
      );
  }
  const { error: insertError } = await db.from("admin_users").insert({
    email: credentials.email,
    password_hash: await hashSecret(credentials.password),
    role: "super_admin",
    is_active: true,
    display_name: "Local Development Admin",
  });
  if (insertError)
    throw new Error(
      "Local account creation failed; private bootstrap files were preserved for retry.",
    );
}
console.info(
  "Local auth configured. Private random login details: .docs/local-auth.local (mode 0600).",
);
console.info(
  "No source users, default passwords, cloud accounts, or provider messages were used.",
);
