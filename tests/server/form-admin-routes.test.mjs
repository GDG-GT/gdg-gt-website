import { afterEach, describe, it, expect, vi } from "vitest";
import { formRoutes } from "../../server/forms.mjs";
import { newField, formDefinitionSchema } from "../../shared/forms.ts";
import { tokenHash } from "../../server/lib/security.mjs";
import {
  fixture,
  ids,
  withLocalMail,
  address,
} from "./form-routes-fixture.mjs";
afterEach(() => vi.unstubAllEnvs());
const base = `/admin/forms/${ids.form}`;
describe("Forms library, authoring and response route contracts", () => {
  it("preserves server-derived creation and destination-specific copy capabilities", async () => {
    const f = fixture();
    f.results.set("list_form_library", {
      items: [
        {
          ...f.row,
          actions: ["view"],
          response_count: null,
          can_duplicate: true,
        },
      ],
      total: 1,
      canCreate: false,
    });
    const r = await f.call("/admin/forms");
    expect(r.body.data.canCreate).toBe(false);
    expect(r.body.data.items[0]).toMatchObject({
      actions: ["view"],
      responseCount: null,
      canDuplicate: true,
    });
    f.results.set("list_form_library", {
      items: [{ ...f.row, actions: ["view"], can_duplicate: false }],
      total: 1,
      canCreate: true,
    });
    const next = await f.call("/admin/forms");
    expect(next.body.data.canCreate).toBe(true);
    expect(next.body.data.items[0].canDuplicate).toBe(false);
  });
  it("ignores unrelated routes and rejects invalid methods, IDs, sessions and CSRF before writes", async () => {
    const f = fixture();
    expect(
      await formRoutes({ url: "/api/v1/unrelated" }, {}, { config: f.config }),
    ).toBe(false);
    expect(
      await formRoutes(
        { url: "/api/v1" + base + "/responses" },
        {},
        { config: f.config },
      ),
    ).toBe(false);
    for (const [path, method] of [
      [base, "POST"],
      [base + "/responses", "DELETE"],
      [base + "/versions", "POST"],
      [base + "/draft", "DELETE"],
      ["/admin/forms/filters", "POST"],
    ])
      expect((await f.call(path, method, {})).statusCode).toBe(405);
    expect((await f.call("/admin/forms/not-an-id")).statusCode).toBe(400);
    expect(
      (await f.call(base, "GET", undefined, { cookie: "" })).statusCode,
    ).toBe(401);
    expect(
      (await f.call(base, "PATCH", {}, { "x-csrf-token": "" })).body.error.code,
    ).toBe("CSRF_INVALID");
    f.results.set("can_operate_form", false);
    expect((await f.call()).statusCode).toBe(404);
    expect(f.queries).toHaveLength(0);
  });
  it("passes every library filter to the server-scoped RPC and rejects malformed or duplicate query values", async () => {
    const f = fixture();
    const r = await f.call(
      `/admin/forms?page=2&pageSize=10&q=fixture&team=${ids.team}&owner=${ids.peer}&state=Open&updatedFrom=2026-10-01&updatedTo=2026-10-22&template=interest`,
    );
    expect(r.statusCode).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledWith("list_form_library", {
      p_actor: ids.actor,
      p_page: 2,
      p_size: 10,
      p_query: "fixture",
      p_team: ids.team,
      p_chapter: false,
      p_owner: ids.peer,
      p_state: "Open",
      p_from: "2026-10-01",
      p_to: "2026-10-22",
      p_template: "interest",
    });
    await f.call("/admin/forms?team=chapter");
    expect(f.db.rpc).toHaveBeenCalledWith(
      "list_form_library",
      expect.objectContaining({
        p_team: null,
        p_chapter: true,
        p_owner: null,
        p_from: null,
        p_to: null,
        p_template: null,
      }),
    );
    await f.call("/admin/forms");
    for (const suffix of [
      "page=0",
      "page=1&page=2",
      "unknown=1",
      "updatedFrom=2026-02-31",
      "updatedFrom=2026-10-22&updatedTo=2026-10-01",
    ])
      expect((await f.call("/admin/forms?" + suffix)).statusCode).toBe(400);
  });
  it("scopes paginated owner/team options and does not return private account attributes", async () => {
    const f = fixture();
    expect(
      (
        await f.call(
          "/admin/forms/filters?kind=owner&page=2&pageSize=10&q=Fictional",
        )
      ).statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledWith("list_form_library_options", {
      p_actor: ids.actor,
      p_kind: "owner",
      p_page: 2,
      p_size: 10,
      p_query: "Fictional",
    });
    await f.call("/admin/forms/filters?kind=team");
    expect(f.db.rpc).toHaveBeenCalledWith(
      "list_form_library_options",
      expect.objectContaining({ p_query: null }),
    );
    expect((await f.call("/admin/forms/filters?kind=email")).statusCode).toBe(
      400,
    );
  });
  it("projects current actions/counts and immutable definitions without response capabilities", async () => {
    const f = fixture();
    f.row.team_id = ids.team;
    f.results.set("can_operate_form", ({ p_action }) => p_action !== "delete");
    f.lists.set("form_responses", [{ id: ids.response }]);
    let r = await f.call(base + "/draft");
    expect(r.body.data.form).toMatchObject({
      team: "Team-scoped",
      responseCount: 1,
      templateKey: null,
      versions: [{ version: 1, versionId: ids.version }],
    });
    expect(r.body.data.form.actions).not.toContain("delete");
    const countQuery = f.queries.find((q) => q.table === "form_responses");
    expect(countQuery.steps).toContainEqual(["is", "deleted_at", null]);
    f.results.set("can_operate_form", ({ p_action }) => p_action === "view");
    r = await f.call();
    expect(r.body.data.form.responseCount).toBeNull();
    expect(r.body.data.form.team).toBe("Team-scoped");
    f.row.team_label = "Fictional Team";
    f.row.owner_label = "Fictional Officer";
    f.row.response_count = 0;
    f.row.actions = ["view"];
    f.row.template_key = "interest";
    expect((await f.call()).body.data.form).toMatchObject({
      team: "Fictional Team",
      ownerLabel: "Fictional Officer",
      responseCount: 0,
      actions: ["view"],
      templateKey: "interest",
    });
    expect((await f.call(base + "/versions")).body.data.items[0].id).toBe(
      ids.version,
    );
  });
  it("creates and duplicates through transactional template provenance and exact team scope", async () => {
    const f = fixture();
    expect(
      (
        await f.call("/admin/forms", "POST", {
          slug: "fictional-new",
          definition: f.definition,
          teamId: ids.team,
          template: "interest",
        })
      ).statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledWith(
      "create_form_from_template",
      expect.objectContaining({
        p_actor: ids.actor,
        p_template: "interest",
        p_document: {
          slug: "fictional-new",
          team_id: ids.team,
          definition: f.definition,
        },
      }),
    );
    expect(
      (
        await f.call("/admin/forms", "POST", {
          slug: "fictional-blank",
          definition: f.definition,
        })
      ).statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledWith(
      "create_form_from_template",
      expect.objectContaining({
        p_template: null,
        p_document: expect.objectContaining({ team_id: null }),
      }),
    );
    f.row.team_id = ids.team;
    f.row.template_key = "survey";
    expect(
      (await f.call(base + "/duplicate", "POST", { slug: "fictional-copy" }))
        .statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledWith(
      "create_form_from_template",
      expect.objectContaining({
        p_template: "survey",
        p_document: {
          slug: "fictional-copy",
          team_id: ids.team,
          definition: { ...f.definition, title: f.row.title + " (copy)" },
        },
      }),
    );
  });
  it("validates draft versus publication requirements without mutating", async () => {
    const f = fixture();
    expect(
      (await f.call(base + "/validate", "POST", { definition: f.definition }))
        .body.data,
    ).toEqual({ valid: true, issues: [] });
    const invalid = {
      ...f.definition,
      settings: { ...f.definition.settings, oneResponse: true },
    };
    const r = await f.call(base + "/validate", "POST", { definition: invalid });
    expect(r.statusCode).toBe(200);
    expect(r.body.data.valid).toBe(false);
    expect(r.body.data.issues.length).toBeGreaterThan(0);
    expect(
      f.db.rpc.mock.calls.every(([name]) => name === "can_operate_form"),
    ).toBe(true);
  });
  it("reads and writes explicit collaborator actions with current transactional enforcement", async () => {
    const f = fixture();
    f.results.set(
      "can_operate_form",
      ({ p_action }) => p_action !== "manage_access",
    );
    expect((await f.call(base + "/collaborators")).statusCode).toBe(403);
    f.results.set("can_operate_form", true);
    f.lists.set("form_collaborators", [
      { admin_user_id: ids.peer, actions: ["view"], created_at: "now" },
    ]);
    expect((await f.call(base + "/collaborators")).body.data.items).toEqual(
      f.lists.get("form_collaborators"),
    );
    expect(
      (await f.call(base + "/collaborators", "PATCH", { userId: ids.peer }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await f.call(base + "/collaborators", "PATCH", {
          userId: ids.peer,
          actions: ["view", "edit"],
        })
      ).statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledWith(
      "mutate_form_collaborator",
      expect.objectContaining({
        p_actor: ids.actor,
        p_form: ids.form,
        p_user: ids.peer,
        p_actions: ["view", "edit"],
        p_delete: false,
      }),
    );
    expect(
      (await f.call(base + "/collaborators", "DELETE", { userId: ids.peer }))
        .statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledWith(
      "mutate_form_collaborator",
      expect.objectContaining({ p_actions: [], p_delete: true }),
    );
    f.results.set("mutate_form_collaborator", { error: { code: "42501" } });
    expect(
      (await f.call(base + "/collaborators", "DELETE", { userId: ids.peer }))
        .statusCode,
    ).toBe(403);
  });
  it("maps draft/state/archive/restore to revision-bound transactions without accepting injected server fields", async () => {
    const f = fixture();
    expect(
      (await f.call(base + "/draft", "PATCH", { revision: 3 })).statusCode,
    ).toBe(400);
    expect(
      (
        await f.call(base, "PATCH", {
          revision: 3,
          definition: f.definition,
          slug: "fictional-renamed",
          teamId: null,
        })
      ).statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledWith(
      "mutate_form",
      expect.objectContaining({
        p_actor: ids.actor,
        p_id: ids.form,
        p_action: "draft",
        p_revision: 3,
        p_schema_hash: null,
        p_document: {
          definition: f.definition,
          slug: "fictional-renamed",
          team_id: null,
        },
      }),
    );
    for (const [operation, method, action, extra] of [
      ["/state", "POST", "state", { state: "Closed" }],
      ["/restore", "POST", "restore", {}],
      ["", "DELETE", "archive", {}],
    ]) {
      expect(
        (await f.call(base + operation, method, { revision: 3, ...extra }))
          .statusCode,
      ).toBe(200);
      expect(f.db.rpc).toHaveBeenCalledWith(
        "mutate_form",
        expect.objectContaining({ p_action: action, p_revision: 3 }),
      );
    }
    expect(
      (
        await f.call(base, "PATCH", {
          revision: 3,
          definition: f.definition,
          ownerId: ids.peer,
        })
      ).statusCode,
    ).toBe(400);
    f.results.set("mutate_form", { error: { code: "40001" } });
    expect(
      (await f.call(base + "/restore", "POST", { revision: 3 })).statusCode,
    ).toBe(409);
  });
  it("publishes the saved immutable definition/hash, not caller-supplied questions", async () => {
    const f = fixture();
    expect(
      (
        await f.call(base + "/publish", "POST", {
          revision: 3,
          definition: { ...f.definition, title: "Caller draft" },
        })
      ).statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledWith(
      "mutate_form",
      expect.objectContaining({
        p_action: "publish",
        p_schema_hash: tokenHash(JSON.stringify(f.definition)),
        p_document: { definition: f.definition },
      }),
    );
    f.row.draft_definition = { ...f.definition, fields: [] };
    expect(
      (await f.call(base + "/publish", "POST", { revision: 3 })).statusCode,
    ).toBe(400);
  });
  it("blocks file publication without scanner readiness and receipt publication without configured reviewed identity", async () => {
    const f = fixture();
    f.definition.fields.push(newField("file", f.definition.sections[0].id));
    vi.stubEnv("UPLOADS_ENABLED", "false");
    expect(
      (await f.call(base + "/publish", "POST", { revision: 3 })).body.error
        .code,
    ).toBe("UPLOADS_NOT_READY");
    vi.stubEnv("UPLOADS_ENABLED", "true");
    expect(
      (await f.call(base + "/publish", "POST", { revision: 3 })).statusCode,
    ).toBe(200);
    f.definition.settings.receipts = true;
    vi.stubEnv("MAIL_MODE", "disabled");
    expect(
      (await f.call(base + "/publish", "POST", { revision: 3 })).body.error
        .code,
    ).toBe("MAIL_NOT_CONFIGURED");
    withLocalMail();
    expect(
      (await f.call(base + "/publish", "POST", { revision: 3 })).body.error
        .code,
    ).toBe("FORM_RECEIPT_IDENTITY");
    f.definition.settings.access = "verified";
    f.results.set("form_receipt_ready", false);
    expect(
      (await f.call(base + "/publish", "POST", { revision: 3 })).body.error
        .code,
    ).toBe("FORM_DELIVERY_REVIEW_REQUIRED");
    f.results.set("form_receipt_ready", true);
    expect(
      (await f.call(base + "/publish", "POST", { revision: 3 })).statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledWith("form_receipt_ready", {
      p_form: ids.form,
      p_hash: tokenHash(
        JSON.stringify(formDefinitionSchema.parse(f.definition)),
      ),
    });
  });
  it("requires separate response/sensitive permissions and scopes immutable-version pagination before answer retrieval", async () => {
    const f = fixture();
    f.results.set("can_operate_form", ({ p_action }) => p_action === "view");
    expect((await f.call(base + "/responses")).statusCode).toBe(404);
    f.results.set(
      "can_operate_form",
      ({ p_action }) => p_action !== "view_sensitive_responses",
    );
    expect((await f.call(base + "/responses?sensitive=true")).statusCode).toBe(
      403,
    );
    f.results.set("can_operate_form", true);
    f.results.set("read_form_responses", {
      items: [],
      total: 0,
      page: 1,
      pageSize: 30,
    });
    expect((await f.call(base + "/responses?version=99")).body.data).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 30,
    });
    expect((await f.call(base + "/responses")).body.data.items).toEqual([]);
    expect((await f.call(base + `/responses/${ids.response}`)).statusCode).toBe(
      404,
    );
    f.results.set("read_form_responses", ({ p_sensitive }) => ({
      items: [
        {
          id: ids.response,
          respondent: {
            name: "Fictional Respondent",
            email: address,
            source: "self_reported",
          },
          answers: p_sensitive
            ? { [f.definition.fields[0].id]: "Fictional sensitive answer" }
            : {},
        },
      ],
      total: 1,
    }));
    const r = await f.call(
      base +
        `/responses/${ids.response}?page=2&pageSize=10&version=1&sensitive=false`,
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.data.items[0]).toMatchObject({
      respondent: {
        name: "Fictional Respondent",
        email: address,
        source: "self_reported",
      },
      answers: {},
    });
    expect(JSON.stringify(r.body)).not.toContain("never-project");
    expect(f.db.rpc).toHaveBeenCalledWith("read_form_responses", {
      p_actor: ids.actor,
      p_form: ids.form,
      p_page: 2,
      p_size: 10,
      p_filters: { id: ids.response, version: 1 },
      p_sensitive: false,
    });
    expect(f.store.audit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "forms.responses_viewed",
        metadata: expect.objectContaining({
          responseId: ids.response,
          count: 1,
        }),
      }),
    );
    const sensitive = await f.call(base + "/responses?sensitive=true");
    expect(
      sensitive.body.data.items[0].answers[f.definition.fields[0].id],
    ).toBe("Fictional sensitive answer");
    expect(f.store.audit).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: "forms.sensitive_viewed" }),
    );
    expect(JSON.stringify(f.store.audit.mock.calls)).not.toContain(address);
    expect((await f.call(base + "/responses?version=zero")).statusCode).toBe(
      400,
    );
  });
});
