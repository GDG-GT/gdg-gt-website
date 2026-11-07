import { runtimeOrigin } from "./lib/runtime-plan.mjs";
const args = process.argv.slice(2), apply = args.includes("--apply"),
  confirmed = args.find((arg) => arg.startsWith("--confirm-origin="))?.slice(17);
if (args.some((arg) => !["--apply", "--plan"].includes(arg) && !arg.startsWith("--confirm-origin=")) || (apply && args.includes("--plan"))) throw Error("Use --plan or --apply --confirm-origin=https://your-domain.");
if (!apply) console.info("Plan only: after migrations, atomically create the first Super Admin and gate hash in an empty production account database. Read INITIAL_OWNER_EMAIL, INITIAL_OWNER_NAME, INITIAL_OWNER_PASSWORD and ADMIN_GATE_SECRET_HASH from the trusted process environment. No credentials are printed or written. Existing accounts are never overwritten. No network access performed.");
else {
  runtimeOrigin(process.env, confirmed);
  const { INITIAL_OWNER_EMAIL: email, INITIAL_OWNER_NAME: name, INITIAL_OWNER_PASSWORD: password, ADMIN_GATE_SECRET_HASH: gateHash } = process.env;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255 || !name?.trim() || name.length > 100 || !password || password.length < 14 || password.length > 128 || !gateHash?.startsWith("scrypt$")) throw Error("Initial owner configuration is incomplete. No values are logged.");
  const { serverDatabase } = await import("../server/db/client.mjs"), { hashSecret } = await import("../server/lib/security.mjs");
  const db = serverDatabase();
  const { error } = await db.rpc("bootstrap_initial_owner", { p_email: email, p_name: name, p_hash: await hashSecret(password), p_gate_hash: gateHash });
  if (error) { console.error("Initial owner was not confirmed. Inspect the database read-only before retrying; existing accounts will never be overwritten."); process.exitCode = 1; }
  else console.info("Initial owner created. Remove INITIAL_OWNER_PASSWORD from the bootstrap environment and verify sign-in through the application.");
}
