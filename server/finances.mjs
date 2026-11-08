import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  parse,
  uuid,
  text,
  queryValues,
  idempotency,
} from "./lib/validation.mjs";
import { riskHash, tokenHash, verifySecret } from "./lib/security.mjs";
import { csvRow } from "./lib/csv.mjs";
import {
  financeCreate,
  financeMutation,
  financeNote,
  budgetCreate,
  budgetMutation,
  financeStates,
  money,
} from "../shared/finances.mjs";
import { taskDate } from "../shared/tasks.mjs";
export const financeQuery = z
  .object({
    q: text(100).default(""),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    state: z.enum(financeStates).optional(),
    type: z.enum(["income", "expense", "transfer", "reimbursement"]).optional(),
    teamId: uuid.optional(),
    from: taskDate.optional(),
    to: taskDate.optional(),
    minAmount: money.optional(),
    maxAmount: money.optional(),
  })
  .strict()
  .refine(
    (v) => !v.from || !v.to || v.from <= v.to,
    "Choose a valid date range.",
  );
async function quota(
  store,
  response,
  config,
  actor,
  scope,
  limit,
  seconds = 900,
) {
  const r = await store.rateLimit(
    scope,
    riskHash(actor, config.riskSecret),
    limit,
    seconds,
  );
  if (!r.allowed) {
    response.setHeader("Retry-After", String(r.retryAfter));
    throw new ApiError(429, "RATE_LIMITED", "Please wait before trying again.");
  }
}
export function financeCsv(items) {
  return (
    "\uFEFF" +
    csvRow([
      "Request ID",
      "Reference",
      "Date",
      "Type",
      "Category",
      "Amount",
      "Currency",
      "State",
      "Description",
      "Vendor",
      "External reference",
      "Team",
      "Budget",
      "Submitter",
      "Submitted at",
      "Team approval required",
    ]) +
    items
      .map((f) =>
        csvRow([
          f.id,
          f.reference,
          f.transactionDate,
          f.transactionType,
          f.category,
          f.amount,
          f.currency,
          f.status,
          f.description,
          f.vendorName,
          f.referenceNumber,
          f.teamName,
          f.budgetName,
          f.creatorName,
          f.submittedAt,
          f.requiresTeamApproval ? "Yes" : "No",
        ]),
      )
      .join("")
  );
}
export async function financeRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/(finances|budgets)(?:\/([^/]+))?(?:\/(notes))?$/,
    );
  if (!match) return false;
  const budget = match[1] === "budgets",
    suffix = match[3];
  allowMethod(
    request,
    response,
    suffix
      ? ["POST"]
      : match[2]
        ? ["GET", "POST", "PATCH", "DELETE"]
        : ["GET", "POST"],
  );
  const session = await requireSession(request, store, config),
    actor = session.user;
  if (
    !checked(
      await db.rpc("can_operate_finance", {
        p_actor: actor.id,
        p_id: null,
        p_action: "create",
        p_team: null,
      }),
    )
  )
    throw new ApiError(
      403,
      "FORBIDDEN",
      "This finance workspace is unavailable for your account.",
    );
  const reply = (data) => {
    sendJson(response, 200, data, requestId);
    return true;
  };
  if (!budget && match[2] === "capabilities" && !suffix) {
    allowMethod(request, response, ["GET"]);
    const globalAdmin = ["admin", "super_admin"].includes(actor.role),
      memberships = await store.memberships(actor.id),
      teams = globalAdmin
        ? checked(
            await db
              .from("admin_teams")
              .select("id,name")
              .eq("is_active", true)
              .is("deleted_at", null)
              .order("name")
              .limit(100),
          )
        : memberships
            .filter((m) => m.is_active && m.team?.is_active)
            .map((m) => ({ id: m.team_id, name: m.team.name }));
    return reply({
      actorId: actor.id,
      globalAdmin,
      canCreate: true,
      teams,
      // Keep the legacy response shape harmless for tabs opened before this
      // release. All financial figures come from the authorized ledger.
      fundingReferences: [],
      fundingNotice: "",
    });
  }
  if (!budget && ["report", "export"].includes(match[2]) && !suffix) {
    allowMethod(request, response, ["GET"]);
    const filter = queryValues(url.searchParams, financeQuery);
    delete filter.page;
    if (match[2] === "report")
      return reply(
        checked(
          await db.rpc("finance_report", {
            p_actor: actor.id,
            p_filter: filter,
          }),
        ),
      );
    await quota(store, response, config, actor.id, "finances.export", 10);
    const exported = checked(
      await db.rpc("export_finances", {
        p_actor: actor.id,
        p_filter: filter,
        p_request_id: requestId,
        p_filter_hash: tokenHash(JSON.stringify(filter)),
      }),
    );
    const csv = financeCsv(exported.items);
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      'attachment; filename="finance-ledger.csv"',
    );
    response.end(csv);
    return true;
  }
  const id = match[2] ? parse(uuid, match[2]) : null;
  if (suffix && (budget || !id))
    throw new ApiError(404, "NOT_FOUND", "This endpoint was not found.");
  if (request.method === "GET") {
    if (budget) {
      if (id) {
        const r = checked(
          await db.rpc("budget_projection", { p_actor: actor.id, p_id: id }),
        );
        if (!r)
          throw new ApiError(404, "NOT_FOUND", "This budget was not found.");
        return reply({ record: r });
      }
      const q = queryValues(
        url.searchParams,
        z
          .object({
            q: text(100).default(""),
            page: z.coerce.number().int().min(1).max(10000).default(1),
            state: z.enum(["draft", "active", "closed", "exceeded"]).optional(),
          })
          .strict(),
      );
      return reply(
        checked(
          await db.rpc("list_budgets", {
            p_actor: actor.id,
            p_page: q.page,
            p_query: q.q,
            p_state: q.state || null,
          }),
        ),
      );
    }
    if (id) {
      const q = queryValues(
        url.searchParams,
        z
          .object({
            notesPage: z.coerce.number().int().min(1).max(10000).default(1),
          })
          .strict(),
      );
      return reply(
        checked(
          await db.rpc("finance_detail", {
            p_actor: actor.id,
            p_id: id,
            p_note_page: q.notesPage,
          }),
        ),
      );
    }
    const { page, ...filter } = queryValues(url.searchParams, financeQuery);
    const listing = checked(
      await db.rpc("list_finances", {
        p_actor: actor.id,
        p_page: page,
        p_filter: filter,
      }),
    );
    const stateCounts = checked(
      await db.rpc("finance_state_counts", {
        p_actor: actor.id,
        p_filter: filter,
      }),
    );
    return reply({ ...listing, stateCounts });
  }
  await requireCsrf(request, session, store);
  if (request.method === "DELETE") {
    if (!id) throw new ApiError(404, "NOT_FOUND", "This record was not found.");
    const visible = checked(
      await db.rpc(budget ? "can_operate_budget" : "can_operate_finance", {
        p_actor: actor.id,
        p_id: id,
        p_action: "read",
      }),
    );
    if (!visible)
      throw new ApiError(404, "NOT_FOUND", "This record was not found.");
    throw new ApiError(
      409,
      "FINANCE_RETAINED",
      "Financial records are retained. Cancel a draft or pending request; deletion is disabled until a financial retention policy is approved.",
    );
  }
  if (request.method === "PATCH" && (!id || suffix))
    throw new ApiError(
      405,
      "METHOD_NOT_ALLOWED",
      "Use the request or budget action endpoint.",
    );
  await quota(store, response, config, actor.id, "finances.mutation", 120, 60);
  const body = await jsonBody(
      request,
      budget
        ? id
          ? budgetMutation
          : budgetCreate
        : suffix
          ? financeNote
          : id
            ? financeMutation
            : financeCreate,
      65536,
    ),
    { currentPassword, ...document } = body;
  let verified = null;
  if (budget || currentPassword !== undefined) {
    await quota(store, response, config, actor.id, "finances.confirm", 30);
    const account = await store.accountByEmail(actor.email);
    if (!(await verifySecret(currentPassword, account?.password_hash)))
      throw new ApiError(
        403,
        "PASSWORD_REQUIRED",
        "Confirm your current password.",
      );
    verified = account.password_hash;
  }
  const args = {
    p_actor: actor.id,
    p_session: session.sessionId,
    p_verified_hash: verified,
    p_id: id,
    p_action: suffix ? "note" : id ? document.action : "create",
    p_revision: document.revision || null,
    p_document: document,
    p_key_hash: tokenHash(idempotency(request)),
    p_request_hash: tokenHash(JSON.stringify(document)),
    p_request_id: requestId,
  };
  return reply(
    checked(await db.rpc(budget ? "mutate_budget" : "mutate_finance", args)),
  );
}
