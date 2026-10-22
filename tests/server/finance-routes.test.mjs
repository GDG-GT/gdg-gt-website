import { describe, it, expect, vi } from "vitest";
import { applicationHandler } from "../../server/handler.mjs";
import { financeRoutes } from "../../server/finances.mjs";
import { token, tokenHash, hashSecret } from "../../server/lib/security.mjs";
const actor = "fd000000-0000-4000-8000-000000000001",
  sid = "fd000000-0000-4000-8000-000000000002",
  id = "fd000000-0000-4000-8000-000000000003",
  team = "fd000000-0000-4000-8000-000000000004";
const password = "Fictional-finance-test-confirmation!",
  hash = await hashSecret(password),
  record = {
    transactionType: "expense",
    category: "Event Costs",
    amount: "12.50",
    description: "Fictional supplies",
    transactionDate: "2026-10-22",
  };
function fixture(role = "team_member") {
  const raw = token(),
    csrf = token(),
    user = {
      id: actor,
      email: "fictional-finance@example.test",
      role,
      is_active: true,
    };
  const config = {
      origin: "https://chapter.example.test",
      sessionCookie: "__Host-gdg_session",
      riskSecret: "fictional-finance-unit-risk",
    },
    store = {
      validateSession: vi.fn(async () => ({ sessionId: sid, user })),
      csrf: vi.fn(async () => ({
        token_hash: tokenHash(csrf),
        expires_at: new Date(Date.now() + 60000).toISOString(),
      })),
      rateLimit: vi.fn(async () => ({ allowed: true })),
      memberships: vi.fn(async () => [
        {
          team_id: team,
          is_active: true,
          team: { name: "Fictional Active", is_active: true },
        },
        {
          team_id: id,
          is_active: false,
          team: { name: "Fictional Inactive", is_active: true },
        },
        {
          team_id: actor,
          is_active: true,
          team: { name: "Fictional Archived", is_active: false },
        },
      ]),
      accountByEmail: vi.fn(async () => ({ password_hash: hash })),
    },
    results = new Map([
      ["can_operate_finance", true],
      ["can_operate_budget", true],
      ["list_finances", { items: [], total: 0 }],
      ["finance_state_counts", { draft: 0 }],
      ["list_budgets", { items: [], total: 0 }],
      ["budget_projection", { id }],
      ["finance_detail", { record: { id }, notes: [] }],
      ["finance_report", { income: "0.00", expense: "12.50" }],
      [
        "export_finances",
        {
          items: [
            { ...record, id, requiresTeamApproval: true },
            { ...record, id: team, requiresTeamApproval: false },
          ],
        },
      ],
      ["mutate_finance", { id }],
      ["mutate_budget", { id }],
    ]),
    queries = [];
  const db = {
      rpc: vi.fn(async (name) =>
        results.get(name)?.error
          ? { data: null, error: results.get(name).error }
          : { data: results.get(name), error: null },
      ),
      from: vi.fn((table) => {
        const query = { table, steps: [] };
        queries.push(query);
        const chain = {};
        for (const method of ["select", "eq", "is", "order", "limit"])
          chain[method] = (...args) => {
            query.steps.push([method, ...args]);
            return chain;
          };
        chain.then = (resolve, reject) =>
          Promise.resolve({
            data: [{ id: team, name: "Fictional Active" }],
            error: null,
          }).then(resolve, reject);
        return chain;
      }),
    },
    app = applicationHandler({ db, store, config });
  async function call(
    path = "/admin/finances",
    method = "GET",
    body,
    headers = {},
  ) {
    const r = {
      statusCode: 200,
      headers: new Map(),
      setHeader(name, value) {
        this.headers.set(name.toLowerCase(), value);
      },
      end(value) {
        this.text = value;
        try {
          this.body = JSON.parse(value);
        } catch {
          /* actual CSV response */
        }
      },
    };
    await app(
      {
        url: "/api/v1" + path,
        method,
        body,
        headers: {
          origin: config.origin,
          cookie: config.sessionCookie + "=" + raw,
          "content-type": "application/json",
          "x-csrf-token": csrf,
          "idempotency-key": "fictional-finance-test-idempotency",
          ...headers,
        },
      },
      r,
    );
    return r;
  }
  return { call, user, config, db, store, results, queries };
}
describe("FIN scoped finance reads, decisions, budgets and CSV dispatch", () => {
  it("leaves unrelated routes alone and checks workspace permission before any ledger query", async () => {
    const f = fixture();
    expect(
      await financeRoutes(
        { url: "/api/v1/unrelated" },
        {},
        { config: f.config },
      ),
    ).toBe(false);
    expect(
      (await f.call("/admin/finances", "GET", undefined, { cookie: "" }))
        .statusCode,
    ).toBe(401);
    f.results.set("can_operate_finance", false);
    expect((await f.call()).statusCode).toBe(403);
    expect(
      f.db.rpc.mock.calls.every(([name]) => name === "can_operate_finance"),
    ).toBe(true);
  });
  it("returns only current active membership choices to members and active bounded teams to administrators", async () => {
    const f = fixture();
    let r = await f.call("/admin/finances/capabilities");
    expect(r.body.data).toMatchObject({
      actorId: actor,
      globalAdmin: false,
      canCreate: true,
      teams: [{ id: team, name: "Fictional Active" }],
      fundingReferences: [],
    });
    expect(f.db.from).not.toHaveBeenCalled();
    f.user.role = "admin";
    r = await f.call("/admin/finances/capabilities");
    expect(r.body.data.globalAdmin).toBe(true);
    expect(r.body.data.fundingReferences).toHaveLength(4);
    expect(r.body.data.fundingNotice).toContain("not live ledger balances");
    expect(f.queries[0]).toEqual({
      table: "admin_teams",
      steps: [
        ["select", "id,name"],
        ["eq", "is_active", true],
        ["is", "deleted_at", null],
        ["order", "name"],
        ["limit", 100],
      ],
    });
    expect(
      (await f.call("/admin/finances/capabilities", "POST", {})).statusCode,
    ).toBe(405);
  });
  it("applies the same exact validated filter to paginated inventory and state counts", async () => {
    const f = fixture(),
      query = new URLSearchParams({
        q: "Fictional",
        page: "2",
        state: "draft",
        type: "expense",
        teamId: team,
        from: "2026-10-01",
        to: "2026-10-22",
        minAmount: "1",
        maxAmount: "20",
      });
    const r = await f.call("/admin/finances?" + query);
    expect(r.body.data.stateCounts).toEqual({ draft: 0 });
    const filter = {
      q: "Fictional",
      state: "draft",
      type: "expense",
      teamId: team,
      from: "2026-10-01",
      to: "2026-10-22",
      minAmount: "1.00",
      maxAmount: "20.00",
    };
    expect(f.db.rpc).toHaveBeenCalledWith("list_finances", {
      p_actor: actor,
      p_page: 2,
      p_filter: filter,
    });
    expect(f.db.rpc).toHaveBeenCalledWith("finance_state_counts", {
      p_actor: actor,
      p_filter: filter,
    });
    expect(
      (await f.call("/admin/finances/" + id + "?notesPage=3")).statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenLastCalledWith("finance_detail", {
      p_actor: actor,
      p_id: id,
      p_note_page: 3,
    });
  });
  it("passes exact validated report/export filters without page, audits scope and emits actual safe CSV headers", async () => {
    const f = fixture(),
      query = "?page=3&state=completed";
    expect(
      (await f.call("/admin/finances/report" + query)).body.data.expense,
    ).toBe("12.50");
    expect(f.db.rpc).toHaveBeenLastCalledWith("finance_report", {
      p_actor: actor,
      p_filter: { q: "", state: "completed" },
    });
    const r = await f.call("/admin/finances/export" + query);
    expect(r.statusCode).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(r.headers.get("content-disposition")).toBe(
      'attachment; filename="finance-ledger.csv"',
    );
    expect(r.text).toContain('"12.50"');
    expect(r.text).toContain('"Yes"');
    expect(r.text).toContain('"No"');
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "export_finances",
      expect.objectContaining({
        p_actor: actor,
        p_filter: { q: "", state: "completed" },
        p_filter_hash: tokenHash(JSON.stringify({ q: "", state: "completed" })),
        p_request_id: expect.any(String),
      }),
    );
    expect(f.store.rateLimit).toHaveBeenCalledWith(
      "finances.export",
      expect.any(String),
      10,
      900,
    );
    expect(
      (await f.call("/admin/finances/report", "POST", {})).statusCode,
    ).toBe(405);
  });
  it("loads budgets with state/pagination and masks missing budgets as not found", async () => {
    const f = fixture();
    expect((await f.call("/admin/budgets")).statusCode).toBe(200);
    expect(f.db.rpc).toHaveBeenLastCalledWith("list_budgets", {
      p_actor: actor,
      p_page: 1,
      p_query: "",
      p_state: null,
    });
    await f.call("/admin/budgets?q=Fictional&page=2&state=active");
    expect(f.db.rpc).toHaveBeenLastCalledWith("list_budgets", {
      p_actor: actor,
      p_page: 2,
      p_query: "Fictional",
      p_state: "active",
    });
    expect((await f.call("/admin/budgets/" + id)).body.data.record.id).toBe(id);
    f.results.set("budget_projection", null);
    expect((await f.call("/admin/budgets/" + id)).statusCode).toBe(404);
    expect(
      (
        await f.call("/admin/budgets/" + id + "/notes", "POST", {
          note: "Fictional",
        })
      ).statusCode,
    ).toBe(404);
  });
  it("requires CSRF and current target read permission before refusing retained record deletion", async () => {
    const f = fixture();
    expect(
      (
        await f.call("/admin/finances/" + id, "DELETE", undefined, {
          "x-csrf-token": "",
        })
      ).body.error.code,
    ).toBe("CSRF_INVALID");
    expect(
      (await f.call("/admin/finances/" + id, "DELETE")).body.error.code,
    ).toBe("FINANCE_RETAINED");
    f.results.set("can_operate_budget", false);
    expect((await f.call("/admin/budgets/" + id, "DELETE")).statusCode).toBe(
      404,
    );
    expect(f.db.rpc).toHaveBeenLastCalledWith("can_operate_budget", {
      p_actor: actor,
      p_id: id,
      p_action: "read",
    });
    expect(
      f.db.rpc.mock.calls.some(([name]) => name.startsWith("mutate_")),
    ).toBe(false);
  });
  it("writes append-only notes and draft updates with server actor/session, revision and stable idempotency hashes", async () => {
    const f = fixture();
    expect(
      (
        await f.call("/admin/finances/" + id + "/notes", "POST", {
          note: "Fictional append-only clarification",
        })
      ).statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "mutate_finance",
      expect.objectContaining({
        p_actor: actor,
        p_session: sid,
        p_id: id,
        p_action: "note",
        p_revision: null,
        p_verified_hash: null,
        p_document: { note: "Fictional append-only clarification" },
        p_key_hash: tokenHash("fictional-finance-test-idempotency"),
      }),
    );
    const document = { action: "update", revision: 2, record };
    expect(
      (await f.call("/admin/finances/" + id, "PATCH", document)).statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "mutate_finance",
      expect.objectContaining({
        p_action: "update",
        p_revision: 2,
        p_request_hash: tokenHash(
          JSON.stringify(f.db.rpc.mock.calls.at(-1)[1].p_document),
        ),
      }),
    );
    expect(f.store.accountByEmail).not.toHaveBeenCalled();
  });
  it("requires a password quota and verified current credential for decisions and all budget changes", async () => {
    const f = fixture(),
      decision = {
        action: "admin_approve",
        revision: 2,
        currentPassword: password,
        confirmation: "FIN-FICTIONAL",
      };
    expect(
      (await f.call("/admin/finances/" + id, "POST", decision)).statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "mutate_finance",
      expect.objectContaining({
        p_verified_hash: hash,
        p_action: "admin_approve",
        p_document: {
          action: "admin_approve",
          revision: 2,
          confirmation: "FIN-FICTIONAL",
        },
      }),
    );
    const budget = {
      name: "Fictional budget",
      totalAmount: "100",
      fiscalYear: "2026",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    };
    expect(
      (
        await f.call("/admin/budgets", "POST", {
          record: budget,
          currentPassword: password,
        })
      ).statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "mutate_budget",
      expect.objectContaining({
        p_verified_hash: hash,
        p_action: "create",
        p_id: null,
      }),
    );
    expect(
      (
        await f.call("/admin/budgets/" + id, "POST", {
          action: "close",
          revision: 2,
          currentPassword: password,
          confirmation: "Fictional budget",
        })
      ).statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "mutate_budget",
      expect.objectContaining({ p_action: "close", p_revision: 2 }),
    );
    expect(f.store.rateLimit).toHaveBeenCalledWith(
      "finances.confirm",
      expect.any(String),
      30,
      900,
    );
  });
  it("never mutates a decision after failed password/quota and propagates database self-approval/immutable conflicts", async () => {
    const f = fixture(),
      decision = {
        action: "admin_approve",
        revision: 2,
        currentPassword: "wrong fictional",
        confirmation: "FIN-FICTIONAL",
      };
    expect(
      (await f.call("/admin/finances/" + id, "POST", decision)).body.error.code,
    ).toBe("PASSWORD_REQUIRED");
    f.store.accountByEmail.mockResolvedValueOnce(null);
    expect(
      (
        await f.call("/admin/finances/" + id, "POST", {
          ...decision,
          currentPassword: password,
        })
      ).statusCode,
    ).toBe(403);
    f.store.rateLimit.mockImplementation(async (scope) => ({
      allowed: scope !== "finances.confirm",
      retryAfter: 60,
    }));
    expect(
      (
        await f.call("/admin/finances/" + id, "POST", {
          ...decision,
          currentPassword: password,
        })
      ).statusCode,
    ).toBe(429);
    expect(
      f.db.rpc.mock.calls.some(([name]) => name.startsWith("mutate_")),
    ).toBe(false);
    f.store.rateLimit.mockResolvedValue({ allowed: true });
    f.results.set("mutate_finance", {
      error: { code: "P0001", message: "FINANCE_IMMUTABLE" },
    });
    expect(
      (
        await f.call("/admin/finances/" + id, "POST", {
          ...decision,
          currentPassword: password,
        })
      ).body.error.code,
    ).toBe("FINANCE_IMMUTABLE");
  });
  it("rejects malformed identifiers, duplicate/unknown queries and unsupported nested method shapes", async () => {
    const f = fixture();
    for (const path of [
      "/admin/finances/not-an-id",
      "/admin/finances?state=a&state=b",
      "/admin/budgets?state=unknown",
      "/admin/finances/" + id + "?notesPage=0",
      "/admin/finances/report?unknown=true",
    ])
      expect((await f.call(path)).statusCode).toBe(400);
    expect(
      (await f.call("/admin/finances/" + id + "/notes", "PATCH", {}))
        .statusCode,
    ).toBe(405);
  });
});
