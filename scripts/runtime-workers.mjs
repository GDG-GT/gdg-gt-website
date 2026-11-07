import { scheduledJobs, workerGroups, runtimeOrigin, dueJobs, invokeScheduledJob } from "./lib/runtime-plan.mjs";
const args = process.argv.slice(2), run = args.includes("--run"), watch = args.includes("--watch"),
  group = args.find((arg) => arg.startsWith("--group="))?.slice(8) || "scheduler",
  confirmed = args.find((arg) => arg.startsWith("--confirm-origin="))?.slice(17);
if (args.some((arg) => !["--run", "--watch", "--plan"].includes(arg) && !arg.startsWith("--group=") && !arg.startsWith("--confirm-origin=")) ||
    !["scheduler", ...workerGroups].includes(group) || (args.includes("--plan") && run)) throw Error("Use --plan or --run --group=scheduler|uploads|media|exports|newsletter --confirm-origin=https://your-domain [--watch].");
if (!run) {
  console.info(JSON.stringify({ mode: "plan-only", network: false, group, scheduledJobs: scheduledJobs.map(([name, cadenceMs]) => ({ name, cadenceMs })), workerGroups, runtime: "Node 24 LTS; supervised persistent process or separate bounded invocations; never expose the scanner" }, null, 2));
} else {
  const origin = runtimeOrigin(process.env, confirmed), due = new Map();
  if (group === "scheduler" && (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32)) throw Error("A server-owned cron secret is required.");
  let stopped = false;
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { stopped = true; });
  const workers = group === "scheduler" ? undefined : group === "uploads"
    ? [(await import("../server/upload-worker.mjs")).runUploadWorker]
    : group === "media" ? [() => import("../server/upload-worker.mjs").then((m) => m.runUploadWorker({ media: true, limit: 1 })), (await import("../server/media-publication-worker.mjs")).runMediaPublicationWorker]
    : group === "exports" ? [(await import("../server/form-export-worker.mjs")).runFormExportWorker]
    : [(await import("../server/newsletter-worker.mjs")).runNewsletterWorker];
  do {
    if (group === "scheduler") {
      for (const [name, cadence] of dueJobs(due, Date.now())) {
        if (stopped) break;
        try {
          const result = await invokeScheduledJob(name, { origin, secret: process.env.CRON_SECRET });
          due.set(name, Date.now() + cadence); console.info(JSON.stringify({ job: name, ...result }));
        } catch { due.set(name, Date.now() + 30000); console.error(JSON.stringify({ job: name, code: "JOB_RETRY" })); if (!watch) process.exitCode = 1; }
      }
    } else for (const worker of workers) {
      if (stopped) break;
      try { console.info(JSON.stringify({ group, counts: await worker() })); }
      catch { console.error(JSON.stringify({ group, code: "WORKER_RETRY" })); if (!watch) process.exitCode = 1; }
    }
    if (watch && !stopped) await new Promise((resolve) => {
      const timer = setTimeout(done, group === "scheduler" ? 5000 : 2000);
      function done() { clearTimeout(timer); process.off("SIGTERM", done); process.off("SIGINT", done); resolve(); }
      process.once("SIGTERM", done); process.once("SIGINT", done);
    });
  } while (watch && !stopped);
}
