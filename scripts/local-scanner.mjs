import { spawn } from "node:child_process";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url)),
  directory = path.join(homedir(), "Library", "Caches", "gdg-gt-scanner");
const action = process.argv[2] || "start";
if (!["start", "update"].includes(action))
  throw new Error("Use start or update.");
await mkdir(directory, { recursive: true, mode: 0o700 });
const certs =
  process.env.CLAMAV_CVD_CERTS_DIRECTORY || "/opt/homebrew/etc/clamav/certs";
const run = (program, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      stdio: "inherit",
      env: { ...process.env, CVD_CERTS_DIR: certs },
    });
    const stop = () => child.kill("SIGTERM");
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    child.on("error", reject);
    child.on("close", (code, signal) => {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
      code === 0 || signal === "SIGTERM"
        ? resolve()
        : reject(new Error("Scanner command failed with status " + code));
    });
  });
const configs = {
  freshclam: path.join(root, "infra/scanner/freshclam.conf"),
  clamd: path.join(directory, "clamd.conf"),
};
await writeFile(
  configs.clamd,
  `DatabaseDirectory ${directory}
CVDCertsDirectory ${certs}
TCPSocket 13310
TCPAddr 127.0.0.1
Foreground yes
MaxThreads 2
MaxQueue 16
ConcurrentDatabaseReload no
StreamMaxLength 262144000
MaxFileSize 262144000
MaxScanSize 536870912
MaxScanTime 60000
MaxRecursion 10
MaxFiles 1000
AlertExceedsMax yes
AlertEncrypted yes
ReadTimeout 30
CommandReadTimeout 10
LogTime yes
LogClean no
`,
  { mode: 0o600 },
);
const binary = process.env.CLAMAV_BIN_DIRECTORY || "/opt/homebrew/bin",
  daemon = process.env.CLAMAV_DAEMON || "/opt/homebrew/sbin/clamd";
let fresh = false;
for (const name of ["daily.cvd", "daily.cld"])
  try {
    fresh =
      Date.now() - (await stat(path.join(directory, name))).mtimeMs <
      12 * 3600000;
    if (fresh) break;
  } catch {
    /* Initial database download is required. */
  }
if (action === "update" || !fresh)
  await run(path.join(binary, "freshclam"), [
    "--config-file=" + configs.freshclam,
    "--datadir=" + directory,
    "--stdout",
  ]);
if (action === "start")
  await run(daemon, ["--config-file=" + configs.clamd, "--foreground"]);
