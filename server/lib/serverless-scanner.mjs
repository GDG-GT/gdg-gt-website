import { spawn } from "node:child_process";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApiError } from "./http.mjs";
import { scannerHealth } from "./scanner.mjs";

const root = fileURLToPath(new URL("../../.build/scanner/runtime/", import.meta.url));
let starting, daemon;
const unavailable = () => new ApiError(503, "SCANNER_UNAVAILABLE", "The private file scanner is not ready.");
export const nativeScannerEnvironment = (env = process.env) => ({ ...env, SCANNER_TRANSPORT: "clamd", CLAMD_HOST: "127.0.0.1", CLAMD_PORT: "13310" });

export async function ensureServerlessScanner(env = process.env) {
  const local = nativeScannerEnvironment(env);
  try { return await scannerHealth(local); } catch { /* Cold instances initialize their private daemon once. */ }
  if (!starting) starting = (async () => {
    const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
    if (manifest.vendorVersion !== "1.5.4" || !manifest.version?.startsWith("ClamAV 1.5.4/")) throw unavailable();
    const directory = await mkdtemp(join(tmpdir(), "gdg-private-scanner-"));
    const config = join(directory, "clamd.conf");
    await writeFile(config, `DatabaseDirectory ${join(root, "definitions")}\nCVDCertsDirectory ${join(root, "certs")}\nTCPSocket 13310\nTCPAddr 127.0.0.1\nForeground yes\nPidFile ${join(directory, "clamd.pid")}\nMaxThreads 1\nMaxQueue 2\nConcurrentDatabaseReload no\nStreamMaxLength 52428800\nMaxFileSize 52428800\nMaxScanSize 536870912\nMaxScanTime 60000\nMaxRecursion 10\nMaxFiles 1000\nAlertExceedsMax yes\nAlertEncrypted yes\nReadTimeout 30\nCommandReadTimeout 10\nSelfCheck 0\nLogClean no\n`, { mode: 0o600 });
    const child = spawn(join(root, "bin/clamd"), ["--config-file=" + config, "--foreground"], {
      shell: false, stdio: "ignore", env: { PATH: process.env.PATH, LD_LIBRARY_PATH: join(root, "lib") },
    });
    daemon = child;
    let failed = false;
    child.once("error", () => { failed = true; });
    try {
      for (let attempt = 0; attempt < 90; attempt++) {
        if (failed || child.exitCode !== null) throw unavailable();
        try { return await scannerHealth(local); } catch { /* Loading the verified signature database is bounded. */ }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      throw unavailable();
    } catch {
      child.kill("SIGKILL");
      if (daemon === child) daemon = undefined;
      await rm(directory, { recursive: true, force: true });
      throw unavailable();
    }
  })();
  try { return await starting; } catch { throw unavailable(); } finally { starting = undefined; }
}
