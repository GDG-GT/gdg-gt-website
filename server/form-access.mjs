import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  parse,
  queryValues,
  uuid,
  slug,
  idempotency,
} from "./lib/validation.mjs";
import { token, tokenHash, riskHash } from "./lib/security.mjs";
import { encryptPayload, decryptPayload } from "./lib/encryption.mjs";
const email = z.string().trim().toLowerCase().email().max(254);
export async function formAccessRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    admin = url.pathname.match(
      /^\/api\/v1\/admin\/forms\/([^/]+)\/(invitations|collaborator-candidates)(?:\/([^/]+))?$/,
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
  const id = parse(uuid, admin[1]),
    candidates = admin[2] === "collaborator-candidates",
    tokenId = admin[3] ? parse(uuid, admin[3]) : null;
  allowMethod(
    request,
    response,
    candidates ? ["GET"] : tokenId ? ["PATCH"] : ["GET", "POST"],
  );
  const session = await requireSession(request, store, config);
  if (request.method !== "GET") await requireCsrf(request, session, store);
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
  if (candidates) {
    const form = checked(
      await db.from("forms").select("team_id,owner_id").eq("id", id).single(),
    );
    let eligible;
    if (form.team_id) {
      const members = checked(
        await db
          .from("team_memberships")
          .select("admin_user_id")
          .eq("team_id", form.team_id)
          .eq("is_active", true),
      );
      eligible = new Set(members.map((m) => m.admin_user_id));
    }
    let candidatesQuery = db
      .from("admin_users")
      .select("id,display_name,role")
      .eq("is_active", true)
      .neq("role", "blog_editor")
      .neq("id", form.owner_id);
    // Apply team scope before pagination; unrelated global accounts must not
    // crowd eligible team members out of the first candidate page.
    if (eligible)
      candidatesQuery = candidatesQuery.or(
        "role.in.(admin,super_admin)" +
          (eligible.size ? ",id.in.(" + [...eligible].join(",") + ")" : ""),
      );
    const rows = checked(
      await candidatesQuery.order("display_name").limit(100),
    );
    sendJson(
      response,
      200,
      {
        items: rows.filter(
          (row) =>
            row.id !== form.owner_id &&
            (!eligible ||
              eligible.has(row.id) ||
              ["admin", "super_admin"].includes(row.role)),
        ),
      },
      requestId,
    );
    return true;
  }
  if (request.method === "GET") {
    const p = queryValues(
      url.searchParams,
      z
        .object({
          page: z.coerce.number().int().min(1).max(10000).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(30),
        })
        .strict(),
    );
    const result = await db
      .from("form_access_tokens")
      .select(
        "id,token_type,intended_email_encrypted,used_count,use_limit,delivery_state,last_sent_at,expires_at,revoked_at,created_at",
        { count: "exact" },
      )
      .eq("form_id", id)
      .order("created_at", { ascending: false })
      .order("id")
      .range((p.page - 1) * p.pageSize, p.page * p.pageSize - 1);
    checked(result);
    const items = result.data.map(({ intended_email_encrypted, ...row }) => {
      const address = decryptPayload(
          intended_email_encrypted,
          config.encryptionSecret,
        ).email,
        [local, domain] = address.split("@");
      return {
        ...row,
        recipientHint: local.slice(0, 2) + "…@" + domain,
        responded: row.used_count > 0,
      };
    });
    await store.audit({
      actorId: session.user.id,
      action: "forms.access_viewed",
      targetType: "form",
      targetId: id,
      requestId,
      metadata: { count: items.length },
    });
    sendJson(response, 200, { items, total: result.count, ...p }, requestId);
    return true;
  }
  await rate("forms.access.admin", session.user.id, 20);
  if (tokenId) {
    const body = await jsonBody(
      request,
      z.object({ action: z.enum(["resend", "revoke"]) }).strict(),
      1024,
    );
    let prepared;
    if (body.action === "resend") {
      const record = checked(
        await db
          .from("form_access_tokens")
          .select("intended_email_encrypted")
          .eq("id", tokenId)
          .eq("form_id", id)
          .maybeSingle(),
      );
      if (!record)
        throw new ApiError(404, "NOT_FOUND", "This invitation was not found.");
      prepared = prepare(
        decryptPayload(record.intended_email_encrypted, config.encryptionSecret)
          .email,
        id,
      );
    }
    checked(
      await db.rpc("change_form_access", {
        p_actor: session.user.id,
        p_form: id,
        p_id: tokenId,
        p_action: body.action,
        p_token_hash: prepared?.tokenHash || null,
        p_secret: prepared?.secretEncrypted || null,
        p_request_id: requestId,
      }),
    );
    sendJson(response, 200, { updated: true }, requestId);
    return true;
  }
  const body = await jsonBody(
    request,
    z
      .object({
        type: z.enum(["invited", "unlisted"]),
        recipients: z.array(email).min(1).max(100),
        expiresInDays: z.number().int().min(1).max(30).default(7),
        confirmed: z.literal(true),
      })
      .strict(),
    32768,
  );
  const key = idempotency(request),
    expiresAt = new Date(
      Date.now() + body.expiresInDays * 86400000,
    ).toISOString();
  const recipients = [...new Set(body.recipients)].map((address) => ({
    ...prepare(address, id),
    expiresAt,
  }));
  const result = checked(
    await db.rpc("queue_form_access", {
      p_actor: session.user.id,
      p_form: id,
      p_type: body.type,
      p_recipients: recipients,
      p_key_hash: tokenHash(key),
      p_request_hash: tokenHash(JSON.stringify(body)),
      p_request_id: requestId,
    }),
  );
  sendJson(response, 200, result, requestId);
  return true;
}
