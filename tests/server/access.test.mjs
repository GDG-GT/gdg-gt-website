import { describe, it, expect, vi } from "vitest";
import { applicationHandler } from "../../server/handler.mjs";
import { accessRoutes } from "../../server/access.mjs";
import { token, tokenHash } from "../../server/lib/security.mjs";
const actor = "fa000000-0000-4000-8000-000000000001",
  sessionId = "fa000000-0000-4000-8000-000000000002",
  form = "fa000000-0000-4000-8000-000000000003",
  team = "fa000000-0000-4000-8000-000000000004";
function fixture(role = "team_member") {
  const raw = token(),
    csrf = token(),
    config = {
      origin: "https://chapter.example.test",
      sessionCookie: "__Host-gdg_session",
      riskSecret: "fictional-access-unit-risk-secret",
    };
  const user = {
      id: actor,
      email: "fictional-access@example.test",
      role,
      is_active: true,
      permission_version: 1,
    },
    membership = {
      team_id: team,
      admin_user_id: actor,
      is_active: true,
      team: { is_active: true },
    };
  const store = {
    validateSession: vi.fn(async () => ({ sessionId, user })),
    csrf: vi.fn(async () => ({
      token_hash: tokenHash(csrf),
      expires_at: new Date(Date.now() + 60000).toISOString(),
    })),
    authorization: vi.fn(async () => ({ memberships: [], grants: [] })),
    memberships: vi.fn(async () => [membership]),
  };
  const queries = [],
    tables = new Map(),
    rpcResults = new Map(),
    rpcErrors = new Map();
  const db = {
    from: vi.fn((table) => {
      const query = { table, steps: [] };
      queries.push(query);
      const chain = {};
      for (const method of [
        "select",
        "eq",
        "is",
        "gt",
        "order",
        "limit",
        "maybeSingle",
      ])
        chain[method] = (...args) => {
          query.steps.push([method, ...args]);
          return chain;
        };
      chain.then = (resolve, reject) =>
        Promise.resolve(
          tables.get(table) || {
            data: table === "team_members" ? null : [],
            error: null,
          },
        ).then(resolve, reject);
      return chain;
    }),
    rpc: vi.fn(async (name) => ({
      data: rpcResults.has(name)
        ? rpcResults.get(name)
        : name.startsWith("can_")
          ? false
          : name === "update_own_profile"
            ? {}
            : { total: 0, items: [] },
      error: rpcErrors.get(name) || null,
    })),
  };
  const handler = applicationHandler({ store, config, db });
  async function call(
    path = "/admin/access",
    method = "GET",
    body,
    headers = {},
  ) {
    const response = {
      statusCode: 200,
      headers: new Map(),
      setHeader(name, value) {
        this.headers.set(name.toLowerCase(), value);
      },
      end(value) {
        this.body = JSON.parse(value);
      },
    };
    await handler(
      {
        url: "/api/v1" + path,
        method,
        body,
        headers: {
          origin: config.origin,
          cookie: config.sessionCookie + "=" + raw,
          "x-csrf-token": csrf,
          "content-type": "application/json",
          ...headers,
        },
      },
      response,
    );
    return response;
  }
  return {
    user,
    store,
    db,
    call,
    queries,
    tables,
    rpcResults,
    rpcErrors,
    membership,
    config,
  };
}
describe("AUTH/TEAM protected access and own-profile route contract", () => {
  it("does not claim unrelated routes and denies anonymous, inactive, cross-origin or unsupported requests before database work", async () => {
    const f = fixture();
    expect(
      await accessRoutes(
        { url: "/api/v1/unrelated" },
        {},
        { config: f.config },
      ),
    ).toBe(false);
    expect(
      (await f.call("/admin/access", "GET", undefined, { cookie: "" }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await f.call("/admin/access", "GET", undefined, {
          origin: "https://elsewhere.example.test",
        })
      ).statusCode,
    ).toBe(403);
    expect((await f.call("/admin/access", "POST", {})).statusCode).toBe(405);
    f.user.is_active = false;
    expect((await f.call()).statusCode).toBe(401);
    expect(f.db.from).not.toHaveBeenCalled();
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("lists only own current sessions with bounded safe columns and a current-session marker", async () => {
    const f = fixture();
    f.tables.set("admin_sessions", {
      data: [{ id: sessionId, created_at: "fictional-time" }, { id: form }],
      error: null,
    });
    const r = await f.call("/admin/me/sessions");
    expect(r.statusCode).toBe(200);
    expect(r.body.data.items.map((row) => row.current)).toEqual([true, false]);
    expect(f.queries[0].steps).toEqual([
      [
        "select",
        "id,created_at,last_seen_at,idle_expires_at,absolute_expires_at",
      ],
      ["eq", "admin_user_id", actor],
      ["is", "revoked_at", null],
      ["gt", "absolute_expires_at", expect.any(String)],
      ["gt", "idle_expires_at", expect.any(String)],
      ["order", "last_seen_at", { ascending: false }],
      ["limit", 100],
    ]);
    expect(JSON.stringify(r.body)).not.toContain("token_hash");
  });
  it("returns bounded own activity without raw audit metadata or peer records", async () => {
    const f = fixture();
    f.tables.set("admin_actions", {
      data: [{ id: form, action: "fictional.action" }],
      error: null,
    });
    const r = await f.call("/admin/me/activity");
    expect(r.statusCode).toBe(200);
    expect(r.body.data.items).toHaveLength(1);
    expect(f.queries[0].steps).toEqual([
      ["select", "id,action,target_type,result,created_at,request_id"],
      ["eq", "actor_id", actor],
      ["order", "created_at", { ascending: false }],
      ["limit", 50],
    ]);
  });
  it("loads only the session account linked profile and current memberships", async () => {
    const f = fixture();
    f.tables.set("team_members", {
      data: { id: form, name: "Fictional profile" },
      error: null,
    });
    const r = await f.call("/admin/me");
    expect(r.body.data.profile.name).toBe("Fictional profile");
    expect(r.body.data.user.id).toBe(actor);
    expect(f.queries[0].steps).toContainEqual(["eq", "admin_user_id", actor]);
    expect(f.queries[0].steps).toContainEqual(["limit", 1]);
    expect(f.store.memberships).toHaveBeenCalledWith(actor);
    expect(r.body.data.memberships).toEqual([f.membership]);
  });
  it("derives profile ownership from the session, validates safe public fields, and requires CSRF", async () => {
    const f = fixture(),
      body = {
        display_name: " Fictional Officer ",
        profile: {
          name: "Fictional Officer",
          role: "Member",
          bio: "Fictional biography",
          imageUrl: "/assets/fixture.webp",
          linkedinUrl: "https://www.linkedin.com/in/fictional",
          githubUrl: "https://github.com/fictional",
        },
      };
    expect(
      (await f.call("/admin/me", "PATCH", body, { "x-csrf-token": "" })).body
        .error.code,
    ).toBe("CSRF_INVALID");
    expect(f.db.rpc).not.toHaveBeenCalled();
    const r = await f.call("/admin/me", "PATCH", body);
    expect(r.body.data).toEqual({ updated: true });
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "update_own_profile",
      expect.objectContaining({
        p_actor: actor,
        p_display_name: "Fictional Officer",
        p_profile: body.profile,
        p_request_id: expect.any(String),
      }),
    );
    expect((await f.call("/admin/me", "PATCH", {})).statusCode).toBe(200);
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "update_own_profile",
      expect.objectContaining({ p_display_name: null, p_profile: null }),
    );
    for (const change of [
      { id: form },
      { role: "super_admin" },
      { email: "other@example.test" },
      { profile: { name: "Fictional", role: "Member", is_active: true } },
      {
        profile: {
          name: "Fictional",
          role: "Member",
          imageUrl: "https://127.0.0.1/secret",
        },
      },
    ])
      expect(
        (await f.call("/admin/me", "PATCH", { ...body, ...change })).statusCode,
      ).toBe(400);
  });
  it("propagates database policy/unavailability without reporting profile success", async () => {
    const f = fixture();
    f.rpcErrors.set("update_own_profile", {
      code: "42501",
      message: "private detail",
    });
    expect(
      (await f.call("/admin/me", "PATCH", { display_name: "Fictional" }))
        .statusCode,
    ).toBe(403);
    f.tables.set("team_members", {
      data: null,
      error: { code: "42P01", message: "private schema" },
    });
    const r = await f.call("/admin/me");
    expect(r.statusCode).toBe(503);
    expect(JSON.stringify(r.body)).not.toContain("private schema");
  });
  it("returns broad administrator route inventory and narrow ordinary/editor inventories", async () => {
    const f = fixture("super_admin");
    let r = await f.call();
    expect(r.body.data.accessibleRoutes).toContain("/admin/users");
    expect(r.body.data.accessibleRoutes).toContain("/admin/privacy");
    expect(f.db.rpc).not.toHaveBeenCalled();
    f.user.role = "admin";
    r = await f.call();
    expect(r.body.data.accessibleRoutes).not.toContain("/admin/users");
    expect(r.body.data.accessibleRoutes).not.toContain("/admin/privacy");
    f.user.role = "team_member";
    r = await f.call();
    expect(r.body.data.accessibleRoutes).toEqual(
      expect.arrayContaining([
        "/admin",
        "/admin/profile",
        "/admin/finances",
        "/admin/communications",
      ]),
    );
    expect(r.body.data.accessibleRoutes).not.toContain("/admin/forms");
    f.user.role = "blog_editor";
    r = await f.call();
    expect(r.body.data.accessibleRoutes).toContain("/admin/blog-editor");
    expect(r.body.data.accessibleRoutes).not.toContain("/admin/events");
    expect(r.body.data.accessibleRoutes).not.toContain("/admin/channels");
  });
  it("discovers individual Forms collaborators/create capability and shared whiteboards without broadening resource authority", async () => {
    const f = fixture();
    f.rpcResults.set("list_forms", { total: 1, items: [] });
    f.rpcResults.set("list_whiteboards", { total: 1 });
    let r = await f.call();
    expect(r.body.data.accessibleRoutes).toContain("/admin/forms");
    expect(r.body.data.accessibleRoutes).toContain("/admin/whiteboard");
    f.rpcResults.set("list_forms", { total: 0, items: [] });
    f.rpcResults.set("can_operate_form", true);
    r = await f.call();
    expect(r.body.data.accessibleRoutes).toContain("/admin/forms");
    expect(f.db.rpc).toHaveBeenCalledWith(
      "can_operate_form",
      expect.objectContaining({
        p_actor: actor,
        p_form: null,
        p_action: "create",
      }),
    );
    expect(
      (
        await f.call(
          "/admin/access?route=/admin/forms&resource=forms&action=publish",
        )
      ).body.data.allowed,
    ).toBe(false);
  });
  it("does not duplicate granted fallback routes and follows current per-page action grants", async () => {
    const f = fixture(),
      grants = [
        {
          team_id: team,
          resource: "forms",
          route: "/admin/forms",
          page_access: true,
          actions: ["view", "publish"],
        },
        {
          team_id: team,
          resource: "finances",
          route: "/admin/finances",
          page_access: true,
          actions: ["view"],
        },
        {
          team_id: team,
          resource: "communications",
          route: "/admin/communications",
          page_access: true,
          actions: ["view"],
        },
      ];
    f.store.authorization.mockResolvedValue({
      memberships: [f.membership],
      grants,
    });
    const r = await f.call();
    for (const route of [
      "/admin/forms",
      "/admin/finances",
      "/admin/communications",
    ])
      expect(
        r.body.data.accessibleRoutes.filter((value) => value === route),
      ).toHaveLength(1);
    expect(
      (
        await f.call(
          "/admin/access?route=/admin/forms&resource=forms&action=publish",
        )
      ).body.data.allowed,
    ).toBe(true);
    expect(
      (
        await f.call(
          "/admin/access?route=/admin/forms&resource=forms&action=delete",
        )
      ).body.data.allowed,
    ).toBe(false);
    expect(
      (await f.call("/admin/access?resource=unknown&action=view")).body.data
        .allowed,
    ).toBe(false);
  });
  it("discovers assigned editor channels/boards without granting unrelated administration", async () => {
    const f = fixture("blog_editor");
    f.rpcResults.set("list_channels", { total: 1 });
    f.rpcResults.set("list_whiteboards", { total: 1 });
    const r = await f.call();
    expect(r.body.data.accessibleRoutes).toContain("/admin/channels");
    expect(r.body.data.accessibleRoutes).toContain("/admin/whiteboard");
    expect(r.body.data.accessibleRoutes).not.toContain("/admin/users");
  });
  it("asks the database for exact Forms edit/response and team-route authority and rejects malformed IDs", async () => {
    const f = fixture("admin");
    f.rpcResults.set("can_operate_form", true);
    f.rpcResults.set("can_operate_team", true);
    expect(
      (
        await f.call(
          "/admin/access?route=" +
            encodeURIComponent("/admin/forms/" + form + "/edit"),
        )
      ).body.data.allowed,
    ).toBe(true);
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "can_operate_form",
      expect.objectContaining({
        p_actor: actor,
        p_form: form,
        p_action: "edit",
      }),
    );
    expect(
      (
        await f.call(
          "/admin/access?route=" +
            encodeURIComponent("/admin/forms/" + form + "/responses"),
        )
      ).body.data.allowed,
    ).toBe(true);
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "can_operate_form",
      expect.objectContaining({ p_action: "view_responses" }),
    );
    expect(
      (
        await f.call(
          "/admin/access?route=" + encodeURIComponent("/admin/team/" + team),
        )
      ).body.data.allowed,
    ).toBe(true);
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "can_operate_team",
      expect.objectContaining({ p_team: team, p_action: "read" }),
    );
    for (const route of [
      "/admin/forms/not-an-id/edit",
      "/admin/team/not-an-id",
      "/admin/unknown",
    ])
      expect(
        (await f.call("/admin/access?route=" + encodeURIComponent(route))).body
          .data.allowed,
      ).toBe(false);
    for (const query of [
      "?route=a&route=b",
      "?unexpected=1",
      "?route=" + "x".repeat(101),
    ])
      expect((await f.call("/admin/access" + query)).statusCode).toBe(400);
  });
});
