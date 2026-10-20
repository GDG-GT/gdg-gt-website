// The loopback runner provides precise local cadence, never a hosted scheduler.
if (
  process.env.NODE_ENV === "production" ||
  process.env.APP_ORIGIN !== "http://127.0.0.1:8080" ||
  process.env.SUPABASE_URL !== "http://127.0.0.1:54361" ||
  !process.env.CRON_SECRET
)
  throw new Error("This runner requires the dedicated local configuration.");
let stopped = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopped = true;
  });
const due = new Map(),
  jobs = [
    ["form-schedules", 300000],
    ["form-cleanup", 3600000],
    ["delivery", 60000],
  ];
do {
  for (const [name, cadence] of jobs) {
    if ((due.get(name) || 0) > Date.now()) continue;
    try {
      const response = await fetch(
        process.env.APP_ORIGIN + "/api/v1/jobs/" + name,
        {
          method: "POST",
          headers: { Authorization: "Bearer " + process.env.CRON_SECRET },
          signal: AbortSignal.timeout(60000),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error("Job unavailable");
      due.set(name, Date.now() + cadence);
      if (result.data.runId)
        console.info(
          JSON.stringify({
            job: name,
            runId: result.data.runId,
            counts: result.data.counts,
          }),
        );
    } catch {
      due.set(name, Date.now() + 30000);
      console.error(JSON.stringify({ job: name, code: "JOB_RETRY" }));
    }
  }
  if (!process.argv.includes("--watch")) break;
  if (!stopped) await new Promise((resolve) => setTimeout(resolve, 5000));
} while (!stopped);
