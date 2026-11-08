import { describe, it, expect, vi } from "vitest";
import { token, tokenHash } from "../../server/lib/security.mjs";
import { encryptPayload } from "../../server/lib/encryption.mjs";
const { generateMemberPass } = vi.hoisted(() => ({
  generateMemberPass: vi.fn(),
}));
vi.mock("../../server/rewards-wallet.mjs", () => ({
  generateMemberPass,
  walletConfiguration: () => null,
}));
import { rewardsRoutes } from "../../server/rewards.mjs";
const id = "b2100000-0000-4000-8000-000000000001";
const memberId = "b2100000-0000-4000-8000-000000000003";
function fixture(role = "super_admin") {
  const csrf = token(),
    raw = token(),
    credential = token();
  const config = {
    origin: "https://gdggt.dev",
    rewardsOrigin: "https://leaderboards.gdggt.dev",
    secureCookies: true,
    sessionCookie: "__Host-gdg_session",
    encryptionSecret: "fictional-wallet-download-encryption",
    riskSecret: "fictional-risk-secret",
  };
  const record = {
    id,
    encrypted_token: encryptPayload({ credential }, config.encryptionSecret),
    members: { name: "Fictional Member" },
  };
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: record, error: null }),
  };
  const db = {
    from: vi.fn(() => query),
    rpc: vi
      .fn()
      .mockResolvedValue({
        data: { id: memberId, csrfHash: tokenHash(csrf) },
        error: null,
      }),
  };
  const store = {
    validateSession: vi
      .fn()
      .mockResolvedValue({
        user: { id, role, is_active: true },
        sessionId: id,
      }),
    rateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  };
  const request = {
    method: "GET",
    url: "/api/v1/admin/rewards/wallet/" + id,
    headers: { host: "gdggt.dev", cookie: "__Host-gdg_session=" + raw },
    socket: { remoteAddress: "127.0.0.1" },
  };
  const response = {
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end: vi.fn(),
  };
  generateMemberPass
    .mockReset()
    .mockResolvedValue(Buffer.from("fictional-pass-archive"));
  return {
    config,
    db,
    query,
    store,
    request,
    response,
    credential,
    csrf,
    raw,
    env: {},
    requestId: id,
  };
}
const run = (f) => rewardsRoutes(f.request, f.response, f);
describe("Private Wallet pass downloads", () => {
  it.each(["admin", "team_member", "blog_editor"])(
    "rejects %s before reading credentials",
    async (role) => {
      const f = fixture(role);
      await expect(run(f)).rejects.toMatchObject({ status: 403 });
      expect(f.db.from).not.toHaveBeenCalled();
      expect(generateMemberPass).not.toHaveBeenCalled();
    },
  );
  it("requires a valid administrative session", async () => {
    const f = fixture();
    f.store.validateSession.mockResolvedValue(null);
    await expect(run(f)).rejects.toMatchObject({ status: 401 });
    expect(f.db.from).not.toHaveBeenCalled();
  });
  it("rejects writes to the read-only download route", async () => {
    const f = fixture();
    f.request.method = "POST";
    await expect(run(f)).rejects.toMatchObject({ status: 405 });
    expect(f.db.from).not.toHaveBeenCalled();
  });
  it("downloads an existing active member pass without creating records or public links", async () => {
    const f = fixture();
    expect(await run(f)).toBe(true);
    expect(f.response.headers).toMatchObject({
      "Content-Type": "application/vnd.apple.pkpass",
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="gdg-member.pkpass"',
    });
    expect(f.response.end).toHaveBeenCalledWith(
      Buffer.from("fictional-pass-archive"),
    );
    expect(generateMemberPass).toHaveBeenCalledWith(
      expect.objectContaining({
        credential: f.credential,
        name: "Fictional Member",
        id,
      }),
    );
    expect(f.query.eq.mock.calls).toEqual([
      ["id", id],
      ["kind", "wallet"],
      ["members.is_active", true],
      ["id", id],
      ["kind", "wallet"],
      ["members.is_active", true],
    ]);
    for (const filter of [
      "revoked_at",
      "members.deleted_at",
      "members.merged_into_id",
    ])
      expect(
        f.query.is.mock.calls.filter(([field]) => field === filter),
      ).toEqual([
        [filter, null],
        [filter, null],
      ]);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("does not sign a missing, revoked or inactive member credential", async () => {
    const f = fixture();
    f.query.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(run(f)).rejects.toMatchObject({ status: 404 });
    expect(generateMemberPass).not.toHaveBeenCalled();
    expect(f.response.end).not.toHaveBeenCalled();
  });
  it("withholds the archive if the credential or member is revoked during signing", async () => {
    const f = fixture();
    f.query.maybeSingle
      .mockResolvedValueOnce({
        data: {
          id,
          encrypted_token: encryptPayload(
            { credential: f.credential },
            f.config.encryptionSecret,
          ),
          members: { name: "Fictional Member" },
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    await expect(run(f)).rejects.toMatchObject({ status: 404 });
    expect(generateMemberPass).toHaveBeenCalledTimes(1);
    expect(f.response.end).not.toHaveBeenCalled();
  });
  it("restricts member downloads to the authenticated directory member", async () => {
    const f = fixture();
    f.request.url = "/api/v1/rewards/wallet/" + id;
    f.request.headers.host = "leaderboards.gdggt.dev";
    f.request.headers.cookie =
      "__Host-gdg_rewards=" + f.raw + "; __Host-gdg_rewards_csrf=" + f.csrf;
    expect(await run(f)).toBe(true);
    expect(f.db.rpc).toHaveBeenCalledWith("reward_member_read", {
      p_hash: tokenHash(f.raw),
    });
    expect(
      f.query.eq.mock.calls.filter(([field]) => field === "member_id"),
    ).toEqual([
      ["member_id", memberId],
      ["member_id", memberId],
    ]);
    expect(generateMemberPass).toHaveBeenCalledWith(
      expect.objectContaining({ origin: "https://leaderboards.gdggt.dev" }),
    );
  });
  it("cannot download another member's credential", async () => {
    const f = fixture();
    f.request.url = "/api/v1/rewards/wallet/" + id;
    f.request.headers.cookie =
      "__Host-gdg_rewards=" + f.raw + "; __Host-gdg_rewards_csrf=" + f.csrf;
    f.query.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(run(f)).rejects.toMatchObject({ status: 404 });
    expect(f.query.eq).toHaveBeenCalledWith("member_id", memberId);
    expect(generateMemberPass).not.toHaveBeenCalled();
  });
});
