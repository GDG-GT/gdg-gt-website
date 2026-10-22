import { runNewsletterWorker } from "../server/newsletter-worker.mjs";
if (
  process.env.NODE_ENV === "production" ||
  process.env.MAIL_MODE !== "local" ||
  process.env.SUPABASE_URL !== "http://127.0.0.1:54361"
)
  throw Error("This runner is restricted to local newsletter mail capture.");
const watch = process.argv.includes("--watch");
let stopped = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopped = true;
  });
do {
  try {
    const result = await runNewsletterWorker();
    if (result.claimed)
      console.info(JSON.stringify({ job: "local-newsletter", ...result }));
  } catch {
    console.error(
      JSON.stringify({ job: "local-newsletter", code: "WORKER_UNAVAILABLE" }),
    );
    if (!watch) process.exitCode = 1;
  }
  if (watch && !stopped)
    await new Promise((resolve) => setTimeout(resolve, 5000));
} while (watch && !stopped);
