import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  parse,
  uuid,
  queryValues,
  idempotency,
  text,
} from "./lib/validation.mjs";
import { tokenHash, riskHash, verifySecret } from "./lib/security.mjs";
import { formDraftDefinitionSchema } from "../shared/forms.ts";
import { mailConfig } from "./delivery.mjs";

export const deliveryPolicyInput = z
  .object({
    formRevision: z.number().int().min(1),
    policyRevision: z.number().int().min(0),
    receipts: z.boolean(),
    receiptAnswers: z.boolean().default(false),
    notificationUsers: z.array(uuid).max(10),
    chapterInbox: z.boolean(),
    notificationAnswers: z.boolean().default(false),
    confirmation: z.string().max(100),
    currentPassword: z.string().min(1).max(1024),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.receiptAnswers && !v.receipts)
      ctx.addIssue({
        code: "custom",
        message: "Answer receipts require receipts to be enabled.",
      });
    if (new Set(v.notificationUsers).size !== v.notificationUsers.length)
      ctx.addIssue({
        code: "custom",
        message: "Choose each recipient only once.",
      });
  });
export async function formDeliveryRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/forms\/([^/]+)\/delivery(?:\/(recovery|candidates))?$/,
    );
  if (!match) return false;
  allowMethod(request, response, match[2] ? ["GET"] : ["GET", "POST"]);
  const controls =
    match[2] === "candidates"
      ? queryValues(
          url.searchParams,
          z
            .object({
              q: text(100).default(""),
              page: z.coerce.number().int().min(1).max(10000).default(1),
              pageSize: z.coerce.number().int().min(1).max(100).default(30),
            })
            .strict(),
        )
      : match[2] === "recovery"
        ? queryValues(
            url.searchParams,
            z.object({ users: z.string().max(400).default("") }).strict(),
          )
        : queryValues(url.searchParams, z.object({}).strict());
  const id = parse(uuid, match[1]),
    session = await requireSession(request, store, config),
    actor = session.user;
  const can = async (who, action) =>
    checked(
      await db.rpc("can_operate_form", {
        p_actor: who,
        p_form: id,
        p_action: action,
      }),
    );
  if (
    !(await can(actor.id, "view")) ||
    !(await can(actor.id, "manage_access")) ||
    !(await can(actor.id, "view_responses"))
  )
    throw new ApiError(
      404,
      "NOT_FOUND",
      "This form's delivery settings are not available.",
    );
  let mail;
  try {
    mail = mailConfig(process.env);
  } catch {
    /* Read-only availability, never a fallback send. */
  }
  if (match[2] === "candidates") {
    const p = controls;
    const result = checked(
      await db.rpc("read_form_delivery_candidates", {
        p_actor: actor.id,
        p_session: session.sessionId,
        p_form: id,
        p_page: p.page,
        p_size: p.pageSize,
        p_query: p.q,
      }),
    );
    sendJson(
      response,
      200,
      {
        items: result.items.map((user) => ({
          id: user.id,
          display_name: user.display_name,
          role: user.role,
        })),
        total: result.total,
        page: p.page,
        pageSize: p.pageSize,
      },
      requestId,
    );
    return true;
  }
  if (match[2] === "recovery") {
    const users = controls.users ? controls.users.split(",") : [];
    parse(z.array(uuid).max(10), users);
    const value = checked(
      await db.rpc("inspect_form_delivery_write", {
        p_actor: actor.id,
        p_session: session.sessionId,
        p_form: id,
        p_key_hash: tokenHash(idempotency(request)),
        p_request_hash: null,
        p_users: users,
      }),
    );
    sendJson(
      response,
      200,
      {
        committed: value.committed,
        canRetry: value.canRetry,
        formId: value.formId,
        formRevision: value.formRevision,
        policyRevision: value.policyRevision,
        editable: value.editable,
        selectedValid: value.selectedValid,
        canReviewAnswers: value.canReviewAnswers,
        mailReady: !!mail,
        chapterInboxAvailable: !!mail?.chapter,
        receipt: value.receipt
          ? { formId: value.receipt.formId, revision: value.receipt.revision }
          : null,
      },
      requestId,
    );
    return true;
  }
  const f = checked(
    await db
      .from("forms")
      .select("id,draft_revision,draft_definition,team_id,owner_id,state")
      .eq("id", id)
      .single(),
  );
  const definition = parse(formDraftDefinitionSchema, f.draft_definition),
    hash = tokenHash(JSON.stringify(definition));
  if (request.method === "POST") {
    await requireCsrf(request, session, store);
    const rate = await store.rateLimit(
      "forms.delivery.review",
      riskHash(actor.id, config.riskSecret),
      10,
      900,
    );
    if (!rate.allowed) {
      response.setHeader("Retry-After", String(rate.retryAfter));
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Wait before reviewing delivery again.",
      );
    }
    const { currentPassword, ...body } = await jsonBody(
      request,
      deliveryPolicyInput,
      8192,
    );
    if (
      (body.receipts || body.notificationUsers.length || body.chapterInbox) &&
      !mail
    )
      throw new ApiError(
        409,
        "MAIL_NOT_CONFIGURED",
        "Configure the reviewed chapter mail transport before enabling delivery.",
      );
    if (body.chapterInbox && !mail?.chapter)
      throw new ApiError(
        409,
        "MAIL_NOT_CONFIGURED",
        "A chapter inbox must be configured on the server.",
      );
    if (body.confirmation !== `DELIVERY ${id}`)
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Type the displayed delivery reference.",
      );
    const account = await store.accountByEmail(actor.email);
    if (!(await verifySecret(currentPassword, account?.password_hash)))
      throw new ApiError(
        403,
        "PASSWORD_REQUIRED",
        "Confirm your current password.",
      );
    const result = checked(
      await db.rpc("review_form_delivery", {
        p_actor: actor.id,
        p_session: session.sessionId,
        p_verified_hash: account.password_hash,
        p_form: id,
        p_form_revision: body.formRevision,
        p_policy_revision: body.policyRevision,
        p_definition: definition,
        p_schema_hash: hash,
        p_document: body,
        p_key_hash: tokenHash(idempotency(request)),
        p_request_hash: tokenHash(JSON.stringify(body)),
        p_request_id: requestId,
      }),
    );
    sendJson(response, 200, result, requestId);
    return true;
  }
  const policy = checked(
    await db
      .from("form_delivery_policies")
      .select(
        "revision,schema_hash,receipts,receipt_answers,notification_users,chapter_inbox,notification_answers,reviewed_at",
      )
      .eq("form_id", id)
      .maybeSingle(),
  );
  // Scope candidate identities before the final DTO. No email/account secrets or
  // unrelated response counts are returned by this configuration surface.
  const selectedAccounts = checked(
    await db.rpc("read_form_delivery_selection", {
      p_actor: actor.id,
      p_session: session.sessionId,
      p_form: id,
    }),
  );
  const policyCurrent =
    !!policy &&
    checked(
      await db.rpc("read_form_delivery_current", {
        p_actor: actor.id,
        p_session: session.sessionId,
        p_form: id,
        p_hash: hash,
      }),
    );
  const eligible = selectedAccounts
    .filter((user) => user.eligible)
    .map((user) => ({
      id: user.id,
      display_name: user.display_name,
      role: user.role,
    }));
  sendJson(
    response,
    200,
    {
      formId: id,
      formRevision: f.draft_revision,
      revision: policy?.revision || 0,
      editable: f.state !== "Archived",
      matchesDraft: !!policy && policy.schema_hash === hash && policyCurrent,
      reviewedAt: policy?.reviewed_at || null,
      receipts: policy?.receipts || false,
      receiptAnswers: policy?.receipt_answers || false,
      notificationUsers: policy?.notification_users || [],
      chapterInbox: policy?.chapter_inbox || false,
      notificationAnswers: policy?.notification_answers || false,
      canReviewAnswers: ["admin", "super_admin"].includes(actor.role),
      mailReady: !!mail,
      chapterInboxAvailable: !!mail?.chapter,
      eligible,
      selectedAccounts: selectedAccounts.map((user) => ({
        id: user.id,
        display_name: user.display_name,
        role: user.role,
        eligible: user.eligible,
      })),
      reference: `DELIVERY ${id}`,
    },
    requestId,
  );
  return true;
}
