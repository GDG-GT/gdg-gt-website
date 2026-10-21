import { runFormExportWorker } from "../server/form-export-worker.mjs";
if (process.env.NODE_ENV === "production" || process.env.SUPABASE_URL !== "http://127.0.0.1:54361")
  throw new Error("This runner is restricted to the dedicated local database.");
const watch = process.argv.includes("--watch");
let stopped = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stopped = true; });
do {
  try {
    const counts = await runFormExportWorker();
    if (counts.claimed || counts.purged || counts.cleanupRetried)
      console.info(JSON.stringify({ job: "form-exports", ...counts }));
  } catch {
    console.error(JSON.stringify({ job: "form-exports", code: "EXPORT_WORKER_UNAVAILABLE" }));
    if (!watch) process.exitCode = 1;
  }
  if (watch && !stopped) await new Promise((resolve) => setTimeout(resolve, 2000));
} while (watch && !stopped);
