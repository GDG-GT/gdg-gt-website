import { randomUUID } from "node:crypto";
import { withRequestTelemetry, requestRecord } from "./telemetry.mjs";

export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}
export const unavailable = () =>
  new ApiError(
    503,
    "TEMPORARILY_UNAVAILABLE",
    "This service is temporarily unavailable. Please try again.",
  );
export function checkOrigin(request, origin, { mutation = false } = {}) {
  const supplied = request.headers.origin;
  if (
    (mutation && !supplied) ||
    (supplied && supplied !== origin) ||
    request.headers["sec-fetch-site"] === "cross-site"
  ) {
    throw new ApiError(403, "FORBIDDEN", "This request is not allowed.");
  }
}
export function allowMethod(request, response, methods) {
  if (!methods.includes(request.method)) {
    response.setHeader("Allow", methods.join(", "));
    throw new ApiError(
      405,
      "METHOD_NOT_ALLOWED",
      "This request method is not allowed.",
    );
  }
}
export async function jsonBody(
  request,
  schema,
  limit = 1024 * 1024,
  { contentTypes = [] } = {},
) {
  const contentType = request.headers["content-type"];
  if (
    typeof contentType !== "string" ||
    (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType) &&
      !contentTypes.includes(contentType.split(";")[0].toLowerCase().trim()))
  ) {
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Send this request as JSON.",
    );
  }
  const declared = request.headers["content-length"];
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "This request is too large.");
  }
  let value;
  try {
    if (request.body !== undefined) {
      const source =
        typeof request.body === "string"
          ? request.body
          : Buffer.isBuffer(request.body)
            ? request.body.toString("utf8")
            : JSON.stringify(request.body);
      if (Buffer.byteLength(source) > limit)
        throw new ApiError(
          413,
          "PAYLOAD_TOO_LARGE",
          "This request is too large.",
        );
      value = JSON.parse(source);
    } else {
      const chunks = [];
      let length = 0;
      for await (const chunk of request) {
        length += Buffer.byteLength(chunk);
        if (length > limit)
          throw new ApiError(
            413,
            "PAYLOAD_TOO_LARGE",
            "This request is too large.",
          );
        chunks.push(Buffer.from(chunk));
      }
      value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "BAD_REQUEST", "The request could not be read.");
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const fields = {};
    for (const issue of parsed.error.issues) {
      // Do not reflect user values, unknown keys, or provider error details.
      const key = issue.path.join(".");
      if (key && /^[A-Za-z0-9_.-]{1,100}$/.test(key))
        fields[key] = "Check this field.";
    }
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Check the highlighted fields.",
      fields,
    );
  }
  return parsed.data;
}
export function sendJson(response, status, data, requestId) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Request-ID", requestId);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify({ data, meta: { requestId } }));
}
export async function apiBoundary(
  request,
  response,
  work,
  { log = () => {} } = {},
) {
  return withRequestTelemetry(async () => {
    const requestId = randomUUID(),
      started = performance.now();
    let errorCode;
    response.setHeader("X-Request-ID", requestId);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    try {
      await work(requestId);
    } catch (error) {
      if (response.headersSent) {
        errorCode = 'RESPONSE_INTERRUPTED';
        response.destroy?.();
        return;
      }
      const safe =
        error instanceof ApiError
          ? error
          : new ApiError(
              500,
              "INTERNAL_ERROR",
              "Something went wrong. Please try again.",
            );
      errorCode = safe.code;
      response.statusCode = safe.status;
      // A public handler may have selected cache headers before a dependency
      // failed. Error responses must never inherit that successful-read policy.
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(
        JSON.stringify({
          error: {
            code: safe.code,
            message: safe.message,
            ...(safe.fields ? { fields: safe.fields } : {}),
          },
          meta: { requestId },
        }),
      );
    } finally {
      // Intentionally no raw URL/query, headers, body, error object, or tokens.
      try {
        await log(
          requestRecord(request, response, requestId, started, errorCode),
        );
      } catch {
        /* A telemetry outage must not replace an already completed response. */
      }
    }
  });
}
