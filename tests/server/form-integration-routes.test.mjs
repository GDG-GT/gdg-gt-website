import { describe, it, expect } from "vitest";
import { formIntegrationRoutes } from "../../server/form-integrations.mjs";
import { fixture, ids } from "./form-routes-fixture.mjs";
import { tokenHash } from "../../server/lib/security.mjs";
const resourceId = ids.team,
  root = (kind) => `/admin/form-integrations/${kind}/${resourceId}`;
const document = () => ({
  revision: 0,
  referenceId: null,
  formId: ids.form,
  formRevision: 3,
  publishedVersionId: ids.version,
  versionPolicy: "latest_published",
  label: "Open fictional form",
});
const received = (kind = "event", action = "save", sourceId = null) => ({
  kind,
  resourceId,
  slot: "primary",
  sourceId,
  action,
  id: ids.access,
});
function setup() {
  const f = fixture();
  f.results.set("read_form_integrations", {
    canEdit: true,
    canLink: true,
    items: [
      {
        id: ids.access,
        slot: "primary",
        formId: ids.form,
        label: "Open form",
        title: "Fictional private form",
        href: "/forms/fictional-form",
        revision: 2,
        versionPolicy: "latest_published",
        fields: ["private"],
      },
    ],
    fields: ["private"],
  });
  f.results.set("read_form_integration_candidates", {
    items: [
      {
        id: ids.form,
        title: "Fictional private form",
        formRevision: 3,
        publishedVersionId: ids.version,
        version: 1,
        access: "internal",
        fields: ["private"],
      },
    ],
    total: 150,
  });
  f.results.set(
    "mutate_form_integration_write",
    ({ p_kind, p_source, p_document }) =>
      received(p_kind, p_document ? "save" : "remove", p_source),
  );
  f.results.set("inspect_form_integration_write", {
    ...received(),
    committed: true,
    canRetry: false,
    reference: { id: ids.access, revision: 3, label: "private" },
    target: {
      id: ids.form,
      formRevision: 3,
      publishedVersionId: ids.version,
      title: "private",
    },
    receipt: received(),
    fields: ["private"],
  });
  return f;
}
describe("Current-session first-party integration contract", () => {
  it("ignores unrelated routes, blocks inappropriate methods and validates resource IDs", async () => {
    const f = setup();
    expect(
      await formIntegrationRoutes(
        { url: "/api/v1/unrelated" },
        {},
        { config: f.config },
      ),
    ).toBe(false);
    expect((await f.call(root("event"), "PUT", document())).statusCode).toBe(
      405,
    );
    expect((await f.call(root("event") + "/primary")).statusCode).toBe(405);
    expect(
      (await f.call(root("event") + "/primary/recovery", "DELETE", {}))
        .statusCode,
    ).toBe(405);
    expect(
      (await f.call("/admin/form-integrations/event/bad")).statusCode,
    ).toBe(400);
    expect(
      (await f.call(root("event") + "/candidates/recovery?action=save"))
        .statusCode,
    ).toBe(404);
  });
  it.each(["event", "team", "campaign"])(
    "projects scoped %s workspace without copied definitions or actor-injected fields",
    async (kind) => {
      const f = setup();
      const r = await f.call(root(kind));
      expect(r.statusCode).toBe(200);
      expect(r.body.data).toMatchObject({
        kind,
        resourceId,
        canEdit: true,
        canLink: true,
        items: [{ id: ids.access, revision: 2 }],
      });
      expect(f.db.rpc).toHaveBeenLastCalledWith("read_form_integrations", {
        p_actor: ids.actor,
        p_session: ids.session,
        p_kind: kind,
        p_resource: resourceId,
      });
      expect(JSON.stringify(r.body)).not.toContain("fields");
    },
  );
  it("delegates full literal candidate search/count/paging and separately scopes a selected form", async () => {
    const f = setup();
    const r = await f.call(
      root("event") + "/candidates?q=%20Fictional%20%25%20&page=4&pageSize=25",
    );
    expect(r.body.data).toMatchObject({
      kind: "event",
      resourceId,
      total: 150,
      page: 4,
      pageSize: 25,
      items: [
        { id: ids.form, formRevision: 3, publishedVersionId: ids.version },
      ],
    });
    expect(JSON.stringify(r.body)).not.toContain("fields");
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "read_form_integration_candidates",
      {
        p_actor: ids.actor,
        p_session: ids.session,
        p_kind: "event",
        p_resource: resourceId,
        p_page: 4,
        p_size: 25,
        p_query: "Fictional %",
        p_selected: null,
      },
    );
    await f.call(root("team") + `/candidates?selected=${ids.form}&pageSize=1`);
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "read_form_integration_candidates",
      expect.objectContaining({
        p_selected: ids.form,
        p_page: 1,
        p_size: 1,
        p_query: "",
      }),
    );
  });
  it.each(["event", "team", "campaign"])(
    "binds reviewed %s creation to original source/reference/target/publication/body/key",
    async (kind) => {
      const f = setup(),
        body = document();
      expect(
        (await f.call(root(kind) + "/primary", "PUT", body)).body.data,
      ).toEqual(received(kind));
      const { revision, referenceId, ...target } = body;
      expect(f.db.rpc).toHaveBeenLastCalledWith(
        "mutate_form_integration_write",
        expect.objectContaining({
          p_actor: ids.actor,
          p_session: ids.session,
          p_kind: kind,
          p_resource: resourceId,
          p_slot: "primary",
          p_source: referenceId,
          p_revision: revision,
          p_document: target,
          p_key_hash: tokenHash(f.key),
          p_request_hash: tokenHash(
            JSON.stringify({
              kind,
              resourceId,
              slot: "primary",
              revision,
              referenceId,
              document: target,
            }),
          ),
        }),
      );
    },
  );
  it("requires the exact selected generation for replacement and removal without requiring target metadata on removal", async () => {
    const f = setup(),
      body = { ...document(), referenceId: ids.access, revision: 2 };
    expect(
      (await f.call(root("event") + "/primary", "PUT", body)).statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "mutate_form_integration_write",
      expect.objectContaining({ p_source: ids.access, p_revision: 2 }),
    );
    const r = await f.call(root("event") + "/primary", "DELETE", {
      referenceId: ids.access,
      revision: 2,
    });
    expect(r.body.data).toEqual(received("event", "remove", ids.access));
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "mutate_form_integration_write",
      expect.objectContaining({
        p_source: ids.access,
        p_revision: 2,
        p_document: null,
      }),
    );
  });
  it("reads minimal original receipts and current metadata without mutation or copied private form content", async () => {
    const f = setup();
    const r = await f.call(
      root("event") + `/primary/recovery?action=save&targetId=${ids.form}`,
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.data).toEqual({
      kind:"event",resourceId,slot:"primary",sourceId:null,action:"save",
      committed: true,
      canRetry: false,
      reference: { id: ids.access, revision: 3 },
      target: {
        id: ids.form,
        formRevision: 3,
        publishedVersionId: ids.version,
      },
      receipt: received(),
    });
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "inspect_form_integration_write",
      {
        p_actor: ids.actor,
        p_session: ids.session,
        p_kind: "event",
        p_resource: resourceId,
        p_slot: "primary",
        p_source: null,
        p_action: "save",
        p_target: ids.form,
        p_key_hash: tokenHash(f.key),
        p_request_hash: null,
      },
    );
    expect(f.db.rpc.mock.calls.some(([n]) => n.startsWith("mutate_"))).toBe(
      false,
    );
  });
  it("projects an unaccepted removal without a target or invented receipt", async () => {
    const f = setup();
    f.results.set("inspect_form_integration_write", {
      ...received("event", "remove", ids.access),
      committed: false,
      canRetry: true,
      reference: { id: ids.access, revision: 2 },
      target: null,
      receipt: null,
    });
    const r = await f.call(
      root("event") + `/primary/recovery?action=remove&sourceId=${ids.access}`,
    );
    expect(r.body.data).toMatchObject({
      target: null,
      receipt: null,
      committed: false,
    });
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "inspect_form_integration_write",
      expect.objectContaining({
        p_source: ids.access,
        p_target: null,
        p_action: "remove",
      }),
    );
  });
  it("projects a missing slot reference without exposing an unrelated object", async () => {
    const f = setup();
    f.results.set("inspect_form_integration_write", {
      ...received(),
      committed: false,
      canRetry: true,
      reference: null,
      target: {
        id: ids.form,
        formRevision: 3,
        publishedVersionId: ids.version,
      },
      receipt: null,
    });
    expect(
      (
        await f.call(
          root("event") + `/primary/recovery?action=save&targetId=${ids.form}`,
        )
      ).body.data.reference,
    ).toBeNull();
  });
  it.each([
    { revision: -1 },
    { referenceId: ids.access },
    { referenceId: null, revision: 1 },
    { formRevision: 0 },
    { formRevision: 2147483648 },
    { publishedVersionId: null },
    { versionPolicy: "draft" },
    { label: " " },
    { label: "x".repeat(81) },
    { definition: {} },
    { actorId: ids.actor },
  ])(
    "rejects an injected, stale-shaped or unreviewed save body",
    async (patch) => {
      const f = setup();
      expect(
        (
          await f.call(root("event") + "/primary", "PUT", {
            ...document(),
            ...patch,
          })
        ).statusCode,
      ).toBe(400);
      expect(f.db.rpc).not.toHaveBeenCalled();
    },
  );
  it.each([
    { revision: 1 },
    { revision: 0, referenceId: ids.access },
    { revision: 1, referenceId: ids.access, formId: ids.form },
  ])("requires a valid selected record on removal", async (body) => {
    const f = setup();
    expect(
      (await f.call(root("event") + "/primary", "DELETE", body)).statusCode,
    ).toBe(400);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it.each([
    "?page=0",
    "?pageSize=101",
    "?page=1&page=2",
    "?selected=bad",
    "?includeDefinitions=true",
  ])("rejects malformed candidate query %s", async (q) => {
    const f = setup();
    expect((await f.call(root("event") + "/candidates" + q)).statusCode).toBe(
      400,
    );
  });
  it.each([
    "?action=remove",
    `?action=remove&sourceId=${ids.access}&targetId=${ids.form}`,
    "?action=save",
    `?action=save&targetId=${ids.form}&actor=${ids.actor}`,
    `?action=save&targetId=${ids.form}&action=remove`,
  ])("rejects malformed original-outcome scope %s", async (q) => {
    const f = setup();
    expect(
      (await f.call(root("event") + "/primary/recovery" + q)).statusCode,
    ).toBe(400);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("requires current session, explicit keys and CSRF before all writes", async () => {
    const f = setup();
    expect(
      (await f.call(root("event"), "GET", undefined, { cookie: "" }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await f.call(root("event") + "/primary", "PUT", document(), {
          "x-csrf-token": "",
        })
      ).body.error.code,
    ).toBe("CSRF_INVALID");
    expect(
      (
        await f.call(root("event") + "/primary", "PUT", document(), {
          "idempotency-key": "",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await f.call(
          root("event") + `/primary/recovery?action=save&targetId=${ids.form}`,
          "GET",
          undefined,
          { "idempotency-key": "" },
        )
      ).statusCode,
    ).toBe(400);
  });
  it.each([
    ["NOT_FOUND", 404],
    ["CONFLICT", 409],
    ["INVALID_STATE", 409],
  ])(
    "preserves transactional %s without falling back to legacy writes",
    async (message, status) => {
      const f = setup();
      f.results.set("mutate_form_integration_write", {
        error: { code: "P0001", message },
      });
      expect(
        (await f.call(root("event") + "/primary", "PUT", document()))
          .statusCode,
      ).toBe(status);
      expect(
        f.db.rpc.mock.calls.filter(([n]) => n.startsWith("mutate_")),
      ).toHaveLength(1);
      expect(
        f.db.rpc.mock.calls.some(([n]) => n === "mutate_form_integration"),
      ).toBe(false);
    },
  );
});
