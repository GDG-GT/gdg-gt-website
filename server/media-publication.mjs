import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  parse,
  uuid,
  queryValues,
  idempotency,
} from "./lib/validation.mjs";
import { riskHash, tokenHash, verifySecret } from "./lib/security.mjs";
import { mediaPublication } from "../shared/media.mjs";
import { objectStorage } from "./lib/object-storage.mjs";
export async function mediaPublicationRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    pub = url.pathname.match(/^\/api\/v1\/media\/public\/([^/]+)$/),
    admin = url.pathname.match(
      /^\/api\/v1\/admin\/media\/files\/([^/]+)\/publication$/,
    );
  if (!pub && !admin) return false;
  const file = parse(uuid, (pub || admin)[1]);
  if (pub) {
    allowMethod(request, response, ["GET", "HEAD"]);
    const { width, download } = queryValues(
      url.searchParams,
      z
        .object({
          width: z.enum(["360", "960", "1920"]).default("960"),
          download: z.literal("true").optional(),
        })
        .strict(),
    );
    const asset = checked(
      await db.rpc("read_public_media_asset", {
        p_file: file,
        p_width: Number(width),
        p_download: !!download,
      }),
    );
    if (!asset)
      throw new ApiError(404, "NOT_FOUND", "This image is not available.");
    if (
      asset.bytes < 1 ||
      asset.bytes > 3670016 ||
      !asset.key.startsWith(`public/${file}/`)
    )
      throw new ApiError(
        503,
        "TEMPORARILY_UNAVAILABLE",
        "This image is temporarily unavailable.",
      );
    const storage = objectStorage();
    try {
      const bytes =
        request.method === "HEAD"
          ? null
          : await storage.bytes("media", asset.key, asset.bytes);
      if (
        bytes &&
        (bytes.length !== asset.bytes || tokenHash(bytes) !== asset.sha256)
      )
        throw new ApiError(
          503,
          "TEMPORARILY_UNAVAILABLE",
          "This image is temporarily unavailable.",
        );
      response.statusCode = 200;
      response.setHeader("Content-Type", "image/webp");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader(
        "Content-Disposition",
        download ? `attachment; filename="gdg-photo-${file}.webp"` : "inline",
      );
      response.setHeader("Content-Length", String(asset.bytes));
      response.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      response.end(bytes);
      return true;
    } finally {
      storage.close();
    }
  }
  allowMethod(request, response, ["POST"]);
  const session = await requireSession(request, store, config);
  await requireCsrf(request, session, store);
  queryValues(url.searchParams, z.object({}).strict());
  const rate = await store.rateLimit(
    "media.publication",
    riskHash(session.user.id, config.riskSecret),
    30,
    900,
  );
  if (!rate.allowed) {
    response.setHeader("Retry-After", String(rate.retryAfter));
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Wait before confirming another image publication.",
    );
  }
  const { currentPassword, ...document } = await jsonBody(
    request,
    mediaPublication,
    4096,
  );
  if (
    document.confirmation !==
    (document.action === "publish" ? "PUBLISH IMAGE" : "REVOKE IMAGE")
  )
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Type the displayed confirmation.",
    );
  const account = await store.accountByEmail(session.user.email);
  if (!(await verifySecret(currentPassword, account?.password_hash)))
    throw new ApiError(
      403,
      "PASSWORD_REQUIRED",
      "Confirm your current password.",
    );
  sendJson(
    response,
    200,
    checked(
      await db.rpc("mutate_media_publication", {
        p_actor: session.user.id,
        p_session: session.sessionId,
        p_file: file,
        p_revision: document.revision,
        p_action: document.action,
        p_verified_hash: account.password_hash,
        p_key_hash: tokenHash(idempotency(request)),
        p_request_hash: tokenHash(JSON.stringify(document)),
        p_request_id: requestId,
      }),
    ),
    requestId,
  );
  return true;
}
