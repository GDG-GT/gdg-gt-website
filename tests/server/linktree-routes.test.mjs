import { describe, expect, it, vi } from "vitest";
import { applicationHandler } from "../../server/handler.mjs";
import { token, tokenHash } from "../../server/lib/security.mjs";
const actor = "ee000000-0000-4000-8000-000000000001",
  sessionId = "ee000000-0000-4000-8000-000000000002",
  profileId = "ee000000-0000-4000-8000-000000000003",
  linkId = "ee000000-0000-4000-8000-000000000004";
function fixture() {
  const raw = token(),
    csrf = token();
  const config = {
    origin: "https://chapter.example.test",
    sessionCookie: "__Host-gdg_session",
    riskSecret: "fictional-risk-secret",
  };
  const store = {
    validateSession: vi.fn(async () => ({
      sessionId,
      user: {
        id: actor,
        email: "fictional@example.test",
        is_active: true,
        role: "team_member",
      },
    })),
    csrf: async () => ({
      token_hash: tokenHash(csrf),
      expires_at: new Date(Date.now() + 60000).toISOString(),
    }),
    rateLimit: vi.fn(async () => ({ allowed: true })),
    accountByEmail: vi.fn(async () => null),
  };
  const db = { rpc: vi.fn(async () => ({ data: { id: profileId } })) };
  const app = applicationHandler({ config, store, db });
  async function call(path, body, headers = {}, method = "POST") {
    const r = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) {
        this.headers[k.toLowerCase()] = v;
      },
      end(v) {
        this.body = JSON.parse(v);
      },
    };
    await app(
      {
        url: "/api/v1" + path,
        method,
        body,
        socket: { remoteAddress: "127.0.0.1" },
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
  }
  return { call, db, store };
}
const record = {
  username: "fictional-page",
  displayName: "Fictional page",
  bio: "Plain text",
  avatarUrl: "",
  background: { type: "color", value: "#f8d8c6" },
  theme: "light",
};
const link = {
  id: linkId,
  title: "Fictional video",
  url: "https://youtu.be/abcdefghijk",
  description: "",
  icon: "video",
  buttonStyle: "default",
  buttonColor: "#f4f5f7",
  textColor: "#25282f",
  embedType: "youtube",
  showClickCount: false,
  clickCount: "42",
};
describe("Linktree HTTP boundaries", () => {
  it("requires origin and CSRF before mutation business work", async () => {
    const f = fixture();
    expect(
      (
        await f.call(
          "/admin/linktree/profiles",
          {},
          { origin: "https://other.example.test" },
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (await f.call("/admin/linktree/profiles", {}, { "x-csrf-token": "" }))
        .body.error.code,
    ).toBe("CSRF_INVALID");
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("derives actor/session and rejects ownership injection", async () => {
    const f = fixture();
    expect(
      (
        await f.call("/admin/linktree/profiles", {
          record,
          teamId: null,
          createdBy: actor,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await f.call("/admin/linktree/profiles", { record, teamId: null }))
        .statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledExactlyOnceWith(
      "mutate_linktree",
      expect.objectContaining({
        p_actor: actor,
        p_session: sessionId,
        p_action: "create",
        p_id: null,
        p_verified_hash: null,
        p_document: { record, teamId: null },
      }),
    );
  });
  it("fails closed on mutation and counter quotas", async () => {
    const f = fixture();
    f.store.rateLimit.mockResolvedValue({ allowed: false, retryAfter: 45 });
    const r = await f.call("/admin/linktree/profiles", {
      record,
      teamId: null,
    });
    expect(r.statusCode).toBe(429);
    expect(r.headers["retry-after"]).toBe("45");
    expect(
      (await f.call("/linktree/fictional-page/views", {})).statusCode,
    ).toBe(429);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("keeps private fields out of public DTOs and canonicalizes opt-in embeds", async () => {
    const f = fixture();
    f.db.rpc.mockResolvedValue({
      data: {
        ...record,
        id: profileId,
        createdBy: actor,
        viewCount: "99",
        teamId: actor,
        links: [
          { ...link, secret: "never-public" },
          { ...link, url: "javascript:alert(1)" },
        ],
      },
    });
    const r = await f.call("/linktree/fictional-page", undefined, {}, "GET");
    expect(r.statusCode).toBe(200);
    expect(r.body.data.profile).toEqual({
      ...record,
      id: profileId,
      links: [
        {
          ...link,
          clickCount: null,
          embedUrl: "https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0",
        },
      ],
    });
    expect(f.store.validateSession).not.toHaveBeenCalled();
    expect(r.headers["cache-control"]).toContain("no-store");
  });
  it("uses identical absence for unsafe public profile configuration", async () => {
    const f = fixture();
    f.db.rpc
      .mockResolvedValueOnce({ data: null })
      .mockResolvedValueOnce({
        data: { ...record, avatarUrl: "javascript:alert(1)", links: [] },
      });
    const a = await f.call("/linktree/missing", undefined, {}, "GET"),
      b = await f.call("/linktree/fictional-page", undefined, {}, "GET");
    expect(a.statusCode).toBe(404);
    expect(b.statusCode).toBe(404);
    expect(a.body.error).toEqual(b.body.error);
  });
  it("counts only validated target IDs, never visitor-supplied metadata", async () => {
    const f = fixture();
    expect(
      (
        await f.call("/linktree/fictional-page/views", {
          ip: "fictional",
          count: 100,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await f.call("/linktree/fictional-page/links/not-a-uuid/click", {}))
        .statusCode,
    ).toBe(400);
    expect(f.db.rpc).not.toHaveBeenCalled();
    expect(
      (await f.call(`/linktree/fictional-page/links/${linkId}/click`, {}))
        .statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledExactlyOnceWith(
      "record_linktree_activity",
      { p_username: "fictional-page", p_link: linkId },
    );
    expect(f.store.rateLimit.mock.calls.map((c) => c[0])).toEqual([
      "linktree.activity",
      "linktree.activity.target",
    ]);
    expect(
      f.store.rateLimit.mock.calls.every((c) => !c[1].includes("127.0.0.1")),
    ).toBe(true);
  });
  it("rejects unsupported methods, duplicate query keys and mismatched link actions", async () => {
    const f = fixture();
    expect(
      (await f.call(`/admin/linktree/profiles/${profileId}`, {}, {}, "DELETE"))
        .statusCode,
    ).toBe(405);
    expect(
      (
        await f.call(
          "/admin/linktree/profiles?page=1&page=2",
          undefined,
          {},
          "GET",
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await f.call("/admin/linktree/links", {
          profileId,
          mutation: {
            action: "publish",
            revision: 1,
            currentPassword: "fictional",
            confirmation: record.displayName,
          },
        })
      ).statusCode,
    ).toBe(400);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("denies an incorrect confirmation password before the publication RPC", async () => {
    const f = fixture();
    const r = await f.call(`/admin/linktree/profiles/${profileId}`, {
      action: "publish",
      revision: 1,
      currentPassword: "fictional-wrong",
      confirmation: record.displayName,
    });
    expect(r.statusCode).toBe(403);
    expect(r.body.error.code).toBe("PASSWORD_REQUIRED");
    expect(f.db.rpc).not.toHaveBeenCalled();
    expect(JSON.stringify(r.body)).not.toContain("fictional-wrong");
  });
});
