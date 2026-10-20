import { describe, expect, it, vi } from "vitest";
import {
  money,
  positiveMoney,
  financeCreate,
  financeMutation,
  financeNote,
  budgetCreate,
  budgetMutation,
} from "../../shared/finances.mjs";
import { financeCsv, financeQuery } from "../../server/finances.mjs";
import { applicationHandler } from "../../server/handler.mjs";
import { token, tokenHash } from "../../server/lib/security.mjs";
import { financeUploadIntent } from "../../server/finance-uploads.mjs";

const record = {
  transactionType: "expense",
  category: "Event Costs",
  amount: "40.1",
  description: "Fictional workshop supplies",
  transactionDate: "2026-10-20",
};
const actor = "ef000000-0000-4000-8000-000000000001";
const sessionId = "ef000000-0000-4000-8000-000000000002";
function fixture() {
  const csrf = token(),
    raw = token();
  const config = {
    origin: "https://chapter.example.test",
    sessionCookie: "__Host-gdg_session",
    riskSecret: "fictional-risk-secret",
  };
  const store = {
    validateSession: async () => ({
      sessionId,
      user: {
        id: actor,
        email: "fictional@example.test",
        role: "team_member",
        is_active: true,
      },
    }),
    csrf: async () => ({
      token_hash: tokenHash(csrf),
      expires_at: new Date(Date.now() + 60000).toISOString(),
    }),
    rateLimit: vi.fn(async () => ({ allowed: true })),
  };
  const db = {
    rpc: vi.fn(async (name) => ({
      data: name === "can_operate_finance" ? true : { id: actor },
    })),
  };
  const app = applicationHandler({ config, store, db });
  const call = async (path = "", body, headers = {}, method = "POST") => {
    const r = {
      statusCode: 200,
      setHeader() {},
      end(value) {
        this.body = JSON.parse(value);
      },
    };
    await app(
      {
        url: "/api/v1/admin/finances" + path,
        method,
        body,
        headers: {
          origin: config.origin,
          cookie: config.sessionCookie + "=" + raw,
          "content-type": "application/json",
          "x-csrf-token": csrf,
          "idempotency-key": token(),
          ...headers,
        },
      },
      r,
    );
    return r;
  };
  return { call, db, store };
}

describe("finance validation", () => {
  it("uses canonical decimal strings without floating-point rounding", () => {
    for (const [input, output] of [
      ["0", "0.00"],
      ["40.1", "40.10"],
      ["9999999999.99", "9999999999.99"],
    ])
      expect(money.parse(input)).toBe(output);
    for (const value of [
      40.1,
      NaN,
      Infinity,
      "-1",
      "01.00",
      ".1",
      "1.",
      "1.001",
      "1e3",
      "1,000",
      "10000000000.00",
      " 1",
      "1\n",
    ])
      expect(money.safeParse(value).success, String(value)).toBe(false);
    expect(positiveMoney.safeParse("0.00").success).toBe(false);
    expect(financeCreate.parse({ record }).record.amount).toBe("40.10");
  });
  it("rejects state, ownership, category, currency and calendar forgery", () => {
    for (const change of [
      { status: "completed" },
      { createdBy: actor },
      { amount: 1 },
      { currency: "EUR" },
      { category: "Donations" },
      { transactionDate: "2026-02-30" },
      { transactionDate: "0000-01-01" },
    ])
      expect(
        financeCreate.safeParse({ record: { ...record, ...change } }).success,
      ).toBe(false);
    expect(financeCreate.safeParse({ record, createdBy: actor }).success).toBe(
      false,
    );
    expect(
      financeNote.safeParse({ note: "漢🙂\nReceipt clarification" }).success,
    ).toBe(true);
    expect(financeNote.safeParse({ note: "\u0000" }).success).toBe(false);
  });
  it("requires current password, revision and typed confirmation for decisions", () => {
    const decision = {
      action: "admin_approve",
      revision: 1,
      currentPassword: "fixture",
      confirmation: "FIN-FICTIONAL",
    };
    expect(financeMutation.safeParse(decision).success).toBe(true);
    for (const change of [
      { revision: 0 },
      { currentPassword: "" },
      { confirmation: "" },
      { action: "complete", amount: "999.00" },
      { action: "reject", reason: "" },
    ])
      expect(
        financeMutation.safeParse({ ...decision, ...change }).success,
      ).toBe(false);
  });
  it("validates ordered budget dates and protects allocation transitions", () => {
    const budget = {
      name: "Fictional allocation",
      totalAmount: "100",
      fiscalYear: "2026",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    };
    expect(
      budgetCreate.parse({ record: budget, currentPassword: "fixture" }).record
        .totalAmount,
    ).toBe("100.00");
    for (const change of [
      { endDate: "2025-12-31" },
      { fiscalYear: "1999" },
      { totalAmount: "0" },
    ])
      expect(
        budgetCreate.safeParse({
          record: { ...budget, ...change },
          currentPassword: "fixture",
        }).success,
      ).toBe(false);
    expect(
      budgetMutation.safeParse({
        action: "close",
        revision: 1,
        currentPassword: "fixture",
        confirmation: budget.name,
      }).success,
    ).toBe(true);
    expect(
      budgetMutation.safeParse({
        action: "delete",
        revision: 1,
        currentPassword: "fixture",
        confirmation: budget.name,
      }).success,
    ).toBe(false);
    expect(
      financeQuery.safeParse({ from: "2026-10-21", to: "2026-10-20" }).success,
    ).toBe(false);
  });
  it("exports exact cents and neutralizes spreadsheet formulas without exposing emails", () => {
    const csv = financeCsv([
      {
        ...record,
        amount: "9999999999.99",
        description: '=HYPERLINK("evil")',
        creatorName: "+fictional",
        email: "private@example.test",
      },
    ]);
    expect(csv).toContain('"9999999999.99"');
    expect(csv).toContain('"\'=HYPERLINK(""evil"")"');
    expect(csv).toContain('"\'+fictional"');
    expect(csv).not.toContain("private@example.test");
  });
});

describe("protected finance dispatch", () => {
  it("keeps finance uploads bounded, private and server-owned", async () => {
    const doc = {
      revision: 1,
      filename: "fictional.pdf",
      mime: "application/pdf",
      bytes: 100,
      sha256: "a".repeat(64),
    };
    expect(financeUploadIntent.safeParse(doc).success).toBe(true);
    for (const change of [
      { bytes: 10485761 },
      { bytes: 0 },
      { mime: "image/svg+xml" },
      { mime: "text/plain" },
      { bucket: "media" },
      { scan_state: "clean" },
    ])
      expect(financeUploadIntent.safeParse({ ...doc, ...change }).success).toBe(
        false,
      );
    const f = fixture(),
      path = "/" + actor + "/attachments";
    expect(
      (await f.call(path, doc, { "x-csrf-token": "" })).body.error.code,
    ).toBe("CSRF_INVALID");
    expect(f.db.rpc).not.toHaveBeenCalled();
    expect((await f.call(path, { ...doc, bytes: 10485761 })).statusCode).toBe(
      400,
    );
    expect(
      (await f.call(path, doc, { "idempotency-key": "" })).statusCode,
    ).toBe(400);
    expect(
      (await f.call(path + "?page=1&page=2", undefined, {}, "GET")).statusCode,
    ).toBe(400);
    expect((await f.call(path, undefined, {}, "DELETE")).statusCode).toBe(405);
    expect(
      f.db.rpc.mock.calls.every(([name]) => name === "can_operate_finance"),
    ).toBe(true);
  });
  it("rejects cross-origin requests before database work", async () => {
    const f = fixture();
    expect(
      (await f.call("", { record }, { origin: "https://other.example.test" }))
        .statusCode,
    ).toBe(403);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("requires CSRF before mutation and never trusts actor IDs", async () => {
    const f = fixture();
    expect(
      (await f.call("", { record }, { "x-csrf-token": "" })).body.error.code,
    ).toBe("CSRF_INVALID");
    expect(
      f.db.rpc.mock.calls.every(([name]) => name === "can_operate_finance"),
    ).toBe(true);
    expect((await f.call("", { record, actorId: actor })).statusCode).toBe(400);
    expect((await f.call("", { record })).statusCode).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledWith(
      "mutate_finance",
      expect.objectContaining({
        p_actor: actor,
        p_session: sessionId,
        p_verified_hash: null,
        p_action: "create",
        p_document: expect.objectContaining({
          record: expect.objectContaining({ amount: "40.10" }),
        }),
      }),
    );
  });
  it("fails closed on workspace denial, rate limits and duplicate filter keys", async () => {
    const f = fixture();
    f.db.rpc.mockResolvedValueOnce({ data: false });
    expect((await f.call()).statusCode).toBe(403);
    expect(
      (await f.call("?state=draft&state=completed", undefined, {}, "GET"))
        .statusCode,
    ).toBe(400);
    f.store.rateLimit.mockResolvedValue({ allowed: false, retryAfter: 10 });
    expect((await f.call("", { record })).statusCode).toBe(429);
    expect(
      f.db.rpc.mock.calls.some(([name]) => name === "mutate_finance"),
    ).toBe(false);
  });
  it("requires idempotency and rejects hard deletion instead of erasing history", async () => {
    const f = fixture();
    expect(
      (await f.call("", { record }, { "idempotency-key": "" })).statusCode,
    ).toBe(400);
    expect(
      (await f.call("/" + actor, undefined, {}, "DELETE")).body.error.code,
    ).toBe("FINANCE_RETAINED");
    expect(
      f.db.rpc.mock.calls.some(([name]) => name === "mutate_finance"),
    ).toBe(false);
  });
});
