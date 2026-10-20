import { runDelivery } from "../server/delivery.mjs";
if (
  process.env.NODE_ENV === "production" ||
  process.env.MAIL_MODE !== "local" ||
  process.env.SUPABASE_URL !== "http://127.0.0.1:54361"
)
  throw new Error("This worker is restricted to local mail capture.");
const watch = process.argv.includes("--watch");
let stopped = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopped = true;
  });
do {
  try {
    const result = await runDelivery();
    if (result.claimed)
      console.info(JSON.stringify({ job: "local-delivery", ...result }));
  } catch {
    console.error(
      JSON.stringify({ job: "local-delivery", code: "WORKER_UNAVAILABLE" }),
    );
    if (!watch) process.exitCode = 1;
  }
  if (watch && !stopped)
    await new Promise((resolve) => setTimeout(resolve, 5000));
} while (watch && !stopped);
