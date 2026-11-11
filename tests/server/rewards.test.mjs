import { randomUUID } from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import {
  rewardsRoutes,
  verifiedGtIdentity,
  rewardsOrigin,
} from "../../server/rewards.mjs";
import {
  rewardAdminSchemas,
  parseCardPayload,
  cardUrl,
} from "../../shared/rewards.mjs";
import { token, tokenHash } from "../../server/lib/security.mjs";
import { encryptPayload } from "../../server/lib/encryption.mjs";
const actor = "b2100000-0000-4000-8000-000000000001",
  session = "b2100000-0000-4000-8000-000000000002",
  member = "b2100000-0000-4000-8000-000000000003";
function setup(role = "super_admin") {
  const raw = token(),
    csrf = token(),
    config = {
      origin: "https://gdggt.dev",
      rewardsOrigin: "https://leaderboards.gdggt.dev",
      secureCookies: true,
      sessionCookie: "__Host-gdg_session",
      encryptionSecret: "fictional-encryption-secret-for-rewards-only",
      riskSecret: "fictional-rewards-rate-limit-secret",
    };
  const store = {
    validateSession: vi.fn(async () => ({
      user: { id: actor, role, is_active: true },
      sessionId: session,
    })),
    csrf: vi.fn(async () => ({
      token_hash: tokenHash(csrf),
      expires_at: new Date(Date.now() + 60000).toISOString(),
    })),
    rateLimit: vi.fn(async () => ({ allowed: true })),
  };
  const db = {
    rpc: vi.fn(async () => ({ data: { members: [] }, error: null })),
    from: vi.fn(),
  };
  const response = {
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    getHeader(k) {
      return this.headers[k];
    },
    end: vi.fn(),
  };
  const req = (path, body, method = body ? "POST" : "GET") => ({
    url: "/api/v1" + path,
    method,
    body,
    headers: {
      host: "gdggt.dev",
      cookie: "__Host-gdg_session=" + raw,
      "x-csrf-token": csrf,
      "content-type": "application/json",
      "idempotency-key": randomUUID(),
    },
    socket: { remoteAddress: "127.0.0.1" },
  });
  return { config, store, db, response, req, csrf };
}
describe("Member rewards boundary", () => {
  it.each(["admin", "team_member", "blog_editor"])(
    "rejects %s before private reads or points writes",
    async (role) => {
      const f = setup(role);
      await expect(
        rewardsRoutes(
          f.req("/admin/rewards/adjust", {
            memberId: member,
            points: 10,
            reason: "Fictional",
          }),
          f.response,
          { ...f, requestId: actor },
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(f.db.rpc).not.toHaveBeenCalled();
    },
  );
  it("requires current CSRF before issuing credentials", async () => {
    const f = setup();
    const request = f.req("/admin/rewards/credential", {
      memberId: member,
      kind: "card",
      label: "Fictional card",
    });
    delete request.headers["x-csrf-token"];
    await expect(
      rewardsRoutes(request, f.response, { ...f, requestId: actor }),
    ).rejects.toMatchObject({ code: "CSRF_INVALID" });
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("does not let a caller specify their own credential token or publication fields", () => {
    expect(
      rewardAdminSchemas.credential.safeParse({
        memberId: member,
        kind: "card",
        label: "Fictional",
        tokenHash: "forged",
      }).success,
    ).toBe(false);
    expect(
      rewardAdminSchemas.adjust.safeParse({
        memberId: member,
        points: 0,
        reason: "Fictional",
      }).success,
    ).toBe(false);
  });
  it("returns the same issued credential on a replay without sending raw tokens to the database", async () => {
    const f = setup(),
      credential = token();
    f.db.rpc.mockResolvedValue({
      data: {
        id: actor,
        member_id: member,
        encryptedToken: encryptPayload(
          { credential },
          f.config.encryptionSecret,
        ),
      },
      error: null,
    });
    await rewardsRoutes(
      f.req("/admin/rewards/credential", {
        memberId: member,
        kind: "card",
        label: "Fictional card",
      }),
      f.response,
      { ...f, requestId: actor },
    );
    const sent = f.db.rpc.mock.calls[0][1];
    expect(sent.p_document.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(sent.p_document).not.toHaveProperty("credential");
    const result = JSON.parse(f.response.end.mock.calls[0][0]).data;
    expect(result.credential).toBe(credential);
    expect(result.url).toBe(cardUrl(f.config.origin, credential));
  });
  it("forwards the physical chip hash without treating it as a Wallet token",async()=>{
    const f=setup(),credential=token(),uid="04aabbccddeeff";
    await rewardsRoutes(f.req("/admin/rewards/resolve",{credential:JSON.stringify({v:2,credential,uid})}),f.response,{...f,requestId:actor});
    expect(f.db.rpc).toHaveBeenCalledWith("reward_resolve_scan",{p_actor:actor,p_session:session,p_hash:tokenHash(credential),p_uid_hash:tokenHash(uid)});
  });
  it("enrolls only the authenticated officer's card and generates the separate digital secret server-side",async()=>{
    const f=setup(),uid="04aabbccddeeff";
    await rewardsRoutes(f.req("/admin/rewards/card-bind",{id:member,uid}),f.response,{...f,requestId:actor});
    const [name,input]=f.db.rpc.mock.calls[0];expect(name).toBe("reward_bind_card");expect(input).toMatchObject({p_actor:actor,p_session:session,p_id:member,p_uid_hash:tokenHash(uid)});
    expect(input.p_digital_hash).toMatch(/^[a-f0-9]{64}$/);expect(input.p_digital_encrypted).not.toContain(uid);expect(input).not.toHaveProperty("uid");
  });
  it("rejects caller supplied binding identity or digital token",async()=>{
    const f=setup();await expect(rewardsRoutes(f.req("/admin/rewards/card-bind",{id:member,uid:"04aabbccddeeff",actor,token:"forged"}),f.response,{...f,requestId:actor})).rejects.toMatchObject({code:"VALIDATION_ERROR"});expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("keeps Wallet issuance unavailable without issuer configuration", async () => {
    const f = setup();
    await expect(
      rewardsRoutes(
        f.req("/admin/rewards/credential", {
          memberId: member,
          kind: "wallet",
          label: "Fictional wallet",
        }),
        f.response,
        { ...f, requestId: actor },
      ),
    ).rejects.toMatchObject({ code: "WALLET_UNAVAILABLE" });
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("does not start SSO with incomplete configuration", async () => {
    const f = setup();
    await expect(
      rewardsRoutes(f.req("/rewards/login", {}), f.response, {
        ...f,
        requestId: actor,
        env: {},
      }),
    ).rejects.toMatchObject({ code: "SSO_UNAVAILABLE" });
    expect(f.db.from).not.toHaveBeenCalled();
  });
  it("does not exchange a callback code without the browser-bound flow cookie", async () => {
    const f = setup(),
      fetchImpl = vi.fn(),
      request = f.req(
        "/rewards/callback?code=fictional-auth-code",
        undefined,
        "GET",
      );
    await expect(
      rewardsRoutes(request, f.response, {
        ...f,
        requestId: actor,
        env: {
          GT_MEMBER_SSO_ENABLED: "true",
          GT_MEMBER_SSO_PROVIDER: "custom:gatech",
          SUPABASE_URL: "https://fictional.supabase.co",
          SUPABASE_PUBLISHABLE_KEY: "fictional-public-key",
        },
        fetchImpl,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("selects only the exact configured leaderboard origin", () => {
    const f = setup();
    expect(
      rewardsOrigin({ headers: { host: "leaderboards.gdggt.dev" } }, f.config),
    ).toBe(f.config.rewardsOrigin);
    expect(
      rewardsOrigin({ headers: { host: "evil.gdggt.dev" } }, f.config),
    ).toBe(f.config.origin);
  });
});
describe("Campus identity verification", () => {
  const now = Date.now(),
    user = {
      email: "member@gatech.edu",
      email_confirmed_at: new Date(now).toISOString(),
      identities: [
        {
          provider: "custom:gatech",
          provider_id: "immutable-subject",
          last_sign_in_at: new Date(now).toISOString(),
          identity_data: { email: "member@gatech.edu", email_verified: true },
        },
      ],
    };
  it("accepts a current confirmed GT provider identity", () =>
    expect(verifiedGtIdentity(user, "custom:gatech", now)).toEqual({
      email: "member@gatech.edu",
      subject: "custom:gatech:immutable-subject",
    }));
  it.each([
    { ...user, identities: [{ ...user.identities[0], provider: "google" }] },
    { ...user, email_confirmed_at: null },
    {
      ...user,
      identities: [
        {
          ...user.identities[0],
          identity_data: { email: "member@gatech.edu", email_verified: false },
        },
      ],
    },
    {
      ...user,
      identities: [
        {
          ...user.identities[0],
          identity_data: { email: "other@gatech.edu", email_verified: true },
        },
      ],
    },
    {
      ...user,
      identities: [
        {
          ...user.identities[0],
          last_sign_in_at: new Date(now - 60000).toISOString(),
        },
      ],
    },
    { ...user, user_metadata: { email_verified: true }, identities: [] },
  ])("rejects untrusted, stale or unrelated identity evidence", (invalid) =>
    expect(() => verifiedGtIdentity(invalid, "custom:gatech", now)).toThrow(),
  );
});
describe("NFC and QR credential parsing", () => {
  it("maps a card URL and its compact payload to the same opaque credential", () => {
    const raw = token();
    expect(parseCardPayload(cardUrl("https://gdggt.dev", raw))).toBe(raw);
    expect(parseCardPayload(raw)).toBe(raw);
    expect(Buffer.byteLength(raw)).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(cardUrl("https://gdggt.dev", raw))).toBeLessThan(
      130,
    );
  });
  it.each([
    "https://evil.test/tap#card=" + token(),
    "https://gdggt.dev/tap?card=" + token(),
    "https://gdggt.dev/tap#card=" + token() + "&card=" + token(),
    "javascript:alert(1)",
    "member@gatech.edu",
    "12345678",
  ])("rejects untrusted reader input %s", (value) =>
    expect(parseCardPayload(value)).toBeNull(),
  );
});
