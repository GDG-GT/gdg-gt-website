import { runUploadWorker } from "../server/upload-worker.mjs";
if (
  process.env.NODE_ENV === "production" ||
  process.env.SUPABASE_URL !== "http://127.0.0.1:54361"
)
  throw new Error("This runner is restricted to the dedicated local database.");
const watch = process.argv.includes("--watch");
let stopped = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopped = true;
  });
do {
  try {
    const result = await runUploadWorker();
    if (result.claimed)
      console.info(JSON.stringify({ job: "local-uploads", ...result }));
  } catch {
    console.error(
      JSON.stringify({ job: "local-uploads", code: "WORKER_UNAVAILABLE" }),
    );
    if (!watch) process.exitCode = 1;
  }
  if (watch && !stopped)
    await new Promise((resolve) => setTimeout(resolve, 2000));
} while (watch && !stopped);
