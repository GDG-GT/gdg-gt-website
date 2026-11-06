import { z } from "zod";
import { requireSession } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  parse,
  queryValues,
  uuid,
  slug,
} from "./lib/validation.mjs";
import { token, tokenHash, riskHash } from "./lib/security.mjs";
import { encryptPayload } from "./lib/encryption.mjs";
const email = z.string().trim().toLowerCase().email().max(254);
export async function formAccessRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    admin = url.pathname.match(
      /^\/api\/v1\/admin\/forms\/([^/]+)\/(collaborator-candidates)$/,
    ),
    verify = url.pathname.match(/^\/api\/v1\/forms\/([^/]+)\/verify$/);
  if (!admin && !verify) return false;
  const rate = async (scope, key, limit) => {
    const value = await store.rateLimit(
      scope,
      riskHash(key, config.riskSecret),
      limit,
      900,
    );
    if (!value.allowed) {
      response.setHeader("Retry-After", String(value.retryAfter));
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Please wait before trying again.",
      );
    }
  };
  const prepare = (address, form) => {
    const raw = token();
    return {
      emailHash: riskHash(
        "form-recipient:" + form + ":" + address,
        config.riskSecret,
      ),
      emailEncrypted: encryptPayload(
        { email: address },
        config.encryptionSecret,
      ),
      tokenHash: tokenHash(raw),
      secretEncrypted: encryptPayload(
        { token: raw, email: address },
        config.encryptionSecret,
      ),
    };
  };
  if (verify) {
    allowMethod(request, response, ["POST"]);
    await rate(
      "forms.verify.ip",
      request.socket?.remoteAddress || "unknown",
      20,
    );
    const formSlug = parse(slug, verify[1]),
      body = await jsonBody(
        request,
        z.object({ email, website: z.string().max(200).default("") }).strict(),
        4096,
      );
    if (!body.website) {
      const addressQuota = await store.rateLimit(
        "forms.verify.email",
        riskHash(formSlug + ":" + body.email, config.riskSecret),
        5,
        900,
      );
      if (addressQuota.allowed) {
        const form = checked(
          await db
            .from("forms")
            .select("id")
            .eq("slug", formSlug)
            .maybeSingle(),
        );
        if (form) {
          const value = prepare(body.email, form.id);
          checked(
            await db.rpc("request_form_verification", {
              p_form: form.id,
              p_email_hash: value.emailHash,
              p_email_encrypted: value.emailEncrypted,
              p_token_hash: value.tokenHash,
              p_secret: value.secretEncrypted,
            }),
          );
        }
      }
    }
    sendJson(
      response,
      200,
      {
        accepted: true,
        message:
          "If email verification is available for this form, a private access link will arrive shortly.",
      },
      requestId,
    );
    return true;
  }
  const id = parse(uuid, admin[1]);
  allowMethod(request, response, ["GET"]);
  const session = await requireSession(request, store, config);
  if (
    !checked(
      await db.rpc("can_operate_form", {
        p_actor: session.user.id,
        p_form: id,
        p_action: "manage_access",
      }),
    )
  )
    throw new ApiError(404, "NOT_FOUND", "This form is not available.");
  {
    const p = queryValues(
      url.searchParams,
      z
        .object({
          page: z.coerce.number().int().min(1).max(10000).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(30),
          q: z.string().trim().max(100).default(""),
        })
        .strict(),
    );
    sendJson(
      response,
      200,
      checked(
        await db.rpc("read_form_collaborator_accounts", {
          p_session: session.sessionId,
          p_actor: session.user.id,
          p_form: id,
          p_kind: "candidates",
          p_page: p.page,
          p_size: p.pageSize,
          p_query: p.q || null,
        }),
      ),
      requestId,
    );
    return true;
  }
}
