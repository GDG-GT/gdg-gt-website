import { z } from "zod";
import { fileURLToPath } from "node:url";
import { ApiError, apiBoundary, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import { authorizeJob } from "./lib/job-authorization.mjs";

const bodySchema = z.object({ group: z.enum(["uploads", "media", "exports", "self-test"]) }).strict();
const ffprobe = fileURLToPath(new URL("../.build/media-runtime/ffprobe", import.meta.url));
export function createBackgroundWorker({ env = process.env, workers, verify } = {}) {
  const configured = { ...env, SCANNER_TRANSPORT: "job-http", FFPROBE_PATH: ffprobe };
  const run = workers || {
    uploads: async () => (await import("./upload-worker.mjs")).runUploadWorker({ env: configured, limit: 1 }),
    media: async () => {
      const scanned = await (await import("./upload-worker.mjs")).runUploadWorker({ env: configured, media: true, limit: 1 });
      const published = await (await import("./media-publication-worker.mjs")).runMediaPublicationWorker({ env: configured, limit: 1 });
      return { scanned, published };
    },
    exports: async () => (await import("./form-export-worker.mjs")).runFormExportWorker({ env: configured, limit: 1 }),
  };
  return (request, response) => apiBoundary(request, response, async requestId => {
    allowMethod(request, response, ["POST"]);
    authorizeJob(request, env);
    if (new URL(request.url, env.APP_ORIGIN).search) throw new ApiError(400, "VALIDATION_ERROR", "Background jobs do not accept query controls.");
    const { group } = await jsonBody(request, bodySchema, 4096);
    if (group === "self-test") {
      const check = verify || (await import("./lib/background-runtime-check.mjs")).verifyBackgroundRuntime;
      return sendJson(response, 200, await check(configured), requestId);
    }
    const counts = await run[group]();
    const needsRetry = value => value && typeof value === "object" && Object.entries(value)
      .some(([key, item]) => ["retried", "cleanupRetried", "lostLease"].includes(key) ? Number(item) > 0 : typeof item === "object" && needsRetry(item));
    if (needsRetry(counts)) throw new ApiError(503, "WORKER_RETRY", "Some background work needs a bounded retry.");
    sendJson(response, 200, { group, counts }, requestId);
  });
}
