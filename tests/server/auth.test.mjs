import { describe, it, expect, vi } from "vitest";
import { createAuthHandler } from "../../server/auth.mjs";
import { token } from "../../server/lib/security.mjs";

const config = {
  origin: "https://chapter.example.test",
  riskSecret: "local-test-risk-secret-not-a-credential",
  secureCookies: true,
  gateCookie: "__Host-gdg_gate",
  sessionCookie: "__Host-gdg_session",
};
class Store {
  gateHash = "only-server-gate-hash";
  gates = new Set();
  counts = new Map();
  auditRows = [];
  sessions = new Map();
  user = {
    id: "10000000-0000-4000-8000-000000000001",
    email: "fixture@example.test",
    role: "super_admin",
    is_active: true,
    password_hash: "only-server-password-hash",
    display_name: "Fixture",
    permission_version: 1,
  };
  async gateConfiguration() {
    return { gate_hash: this.gateHash, gate_version: 1 };
  }
  async rateLimit(scope, key, limit) {
    const k = scope + key;
    const n = (this.counts.get(k) || 0) + 1;
    this.counts.set(k, n);
    return { allowed: n <= limit, retryAfter: 900 };
  }
  async checkRateLimit(scope, key, limit) {
    return {
      allowed: (this.counts.get(scope + key) || 0) < limit,
      retryAfter: 900,
    };
  }
  async createGate(hash) {
    this.gates.add(hash);
  }
  async validGate(hash) {
    return this.gates.has(hash);
  }
  async accountByEmail(email) {
    return email === this.user.email ? this.user : null;
  }
  async recordLoginFailure() {
    return;
  }
  async createSession(values) {
    this.sessions.set(values.tokenHash, {
      ...values,
      id: token(),
      revoked: false,
    });
  }
  async validateSession(hash) {
    const session = this.sessions.get(hash);
    return session && !session.revoked && this.user.is_active
      ? {
          sessionId: session.id,
          user: {
            id: this.user.id,
            email: this.user.email,
            role: this.user.role,
            is_active: true,
            permission_version: 1,
          },
        }
      : null;
  }
  async csrf(id) {
    const row = [...this.sessions.values()].find((row) => row.id === id);
    return row
      ? {
          token_hash: row.csrfHash,
          expires_at: new Date(Date.now() + 3600000).toISOString(),
        }
      : null;
  }
  async rotateCsrf(id, hash) {
    const row = [...this.sessions.values()].find((row) => row.id === id);
    if (row) row.csrfHash = hash;
  }
  async memberships() {
    return [];
  }
  async revokeSession(id) {
    for (const row of this.sessions.values())
      if (row.id === id) row.revoked = true;
  }
  async revokeOtherSessions() {
    return;
  }
  async changePassword(values) {
    this.user.password_hash = values.newHash;
    for (const [hash, row] of this.sessions) {
      if (row.id === values.sessionId) {
        this.sessions.delete(hash);
        this.sessions.set(values.tokenHash, {
          ...row,
          csrfHash: values.csrfHash,
        });
        break;
      }
    }
  }
  async audit(row) {
    this.auditRows.push(row);
  }
}
function fixture() {
  const store = new Store();
  const log = vi.fn();
  const verify = vi.fn(
    async (value, hash) =>
      (value === "correct-gate" && hash === store.gateHash) ||
      (value === "Correct password! 2026" && hash === store.user.password_hash),
  );
  const handler = createAuthHandler({ store, config, verify, log });
  async function call(url, method = "GET", body, headers = {}) {
    const response = {
      headers: new Map(),
      statusCode: 200,
      getHeader(name) {
        return this.headers.get(name.toLowerCase());
      },
      setHeader(name, value) {
        this.headers.set(name.toLowerCase(), value);
      },
      end(value) {
        this.body = JSON.parse(value);
      },
    };
    await handler(
      {
        url,
        method,
        body,
        headers: {
          origin: config.origin,
          "content-type": "application/json",
          ...headers,
        },
        socket: { remoteAddress: "127.0.0.1" },
      },
      response,
    );
    return response;
  }
  const cookie = (response, name) =>
    response
      .getHeader("set-cookie")
      ?.find((value) => value.startsWith(name + "="))
      ?.split(";")[0];
  async function login() {
    const gate = await call("/api/v1/auth/gate", "POST", {
      code: "correct-gate",
    });
    const gateCookie = cookie(gate, config.gateCookie);
    const result = await call(
      "/api/v1/auth/login",
      "POST",
      { email: store.user.email, password: "Correct password! 2026" },
      { cookie: gateCookie },
    );
    return {
      result,
      csrf: result.body.data.csrfToken,
      cookie: cookie(result, config.sessionCookie),
      gateCookie,
    };
  }
  return { store, call, verify, log, login, cookie };
}
describe("auth API boundary", () => {
  it('gate status distinguishes absent, forged and current opaque capabilities without disclosing settings', async () => {
    const f=fixture();
    expect((await f.call('/api/v1/auth/gate')).body.data).toEqual({gateValid:false});
    expect((await f.call('/api/v1/auth/gate','GET',undefined,{cookie:config.gateCookie+'='+token()})).body.data).toEqual({gateValid:false});
    const issued=await f.call('/api/v1/auth/gate','POST',{code:'correct-gate'});
    expect((await f.call('/api/v1/auth/gate','GET',undefined,{cookie:f.cookie(issued,config.gateCookie)})).body.data).toEqual({gateValid:true});
  });
  it('request-volume exhaustion rejects before KDF work, independently of the failed-gate limit', async () => {
    const f=fixture();
    f.store.rateLimit=async()=>({allowed:false,retryAfter:47});
    const result=await f.call('/api/v1/auth/gate','POST',{code:'correct-gate'});
    expect(result.statusCode).toBe(429);expect(result.getHeader('retry-after')).toBe('47');expect(f.verify).not.toHaveBeenCalled();
  });
  it('every disabled, deleted, temporary-expired or locked account state prevents cookie issuance', async () => {
    for(const state of [{is_active:false},{deleted_at:new Date().toISOString()},{must_change_password:true},
      {temporary_password_expires_at:new Date(Date.now()-1000).toISOString()}, {locked_until:new Date(Date.now()+60000).toISOString()}]){
      const f=fixture();Object.assign(f.store.user,state);
      const gate=await f.call('/api/v1/auth/gate','POST',{code:'correct-gate'});
      const result=await f.call('/api/v1/auth/login','POST',{email:f.store.user.email,password:'Correct password! 2026'},
        {cookie:f.cookie(gate,config.gateCookie)});
      expect(result.statusCode).toBe(401);expect(result.getHeader('set-cookie')).toBeUndefined();
    }
  });
  it('future temporary expiry and expired lock do not reject an otherwise valid account', async () => {
    const f=fixture();Object.assign(f.store.user,{temporary_password_expires_at:new Date(Date.now()+60000).toISOString(),locked_until:new Date(Date.now()-1000).toISOString()});
    expect((await f.login()).result.statusCode).toBe(200);
  });
  it('login volume throttling uses the same bounded generic failure envelope', async () => {
    const f=fixture(), original=f.store.rateLimit.bind(f.store);
    f.store.rateLimit=(scope,...args)=>scope==='auth.login.ip'?Promise.resolve({allowed:false,retryAfter:19}):original(scope,...args);
    const gate=await f.call('/api/v1/auth/gate','POST',{code:'correct-gate'});
    const result=await f.call('/api/v1/auth/login','POST',{email:f.store.user.email,password:'Correct password! 2026'},{cookie:f.cookie(gate,config.gateCookie)});
    expect(result.statusCode).toBe(429);expect(result.getHeader('retry-after')).toBe('19');
  });
  it('password reuse, other-session revocation and unexpected CSRF-store outages take distinct safe paths', async () => {
    const f=fixture(), signed=await f.login(), headers={cookie:signed.cookie,'x-csrf-token':signed.csrf};
    const reused=await f.call('/api/v1/auth/password','POST',{currentPassword:'Correct password! 2026',newPassword:'Correct password! 2026'},headers);
    expect(reused.statusCode).toBe(400);expect(reused.body.error.fields.newPassword).toBeTruthy();
    const revoke=vi.spyOn(f.store,'revokeOtherSessions');
    expect((await f.call('/api/v1/auth/sessions','DELETE',undefined,headers)).body.data).toEqual({revoked:true});
    expect(revoke).toHaveBeenCalledOnce();
    f.store.csrf=async()=>{throw Error('never-return-provider-secret');};
    const outage=await f.call('/api/v1/auth/session','GET',undefined,headers);
    expect(outage.statusCode).toBe(500);expect(JSON.stringify(outage.body)).not.toContain('never-return');
    expect((await f.call('/api/v1/auth/unknown')).statusCode).toBe(404);
  });
  it("session generation bindings reject stale intent even with valid replacement CSRF", async () => {
    const f = fixture(),
      first = await f.login(),
      second = await f.login();
    const a = first.result.body.data.sessionBinding,
      b = second.result.body.data.sessionBinding;
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(b).not.toBe(a);
    const changed = await f.call("/api/v1/auth/session", "DELETE", undefined, {
      cookie: second.cookie,
      "x-csrf-token": second.csrf,
      "x-session-binding": a,
    });
    expect(changed.statusCode).toBe(409);
    expect(changed.body.error.code).toBe("SESSION_CHANGED");
    const current = await f.call("/api/v1/auth/session", "GET", undefined, {
      cookie: second.cookie,
      "x-csrf-token": second.csrf,
      "x-session-binding": b,
    });
    expect(current.statusCode).toBe(200);
    expect(current.body.data.sessionBinding).toBe(b);
  });
  it("CSRF refresh preserves generation binding and malformed bindings cannot authenticate", async () => {
    const f = fixture(),
      signed = await f.login();
    const binding = signed.result.body.data.sessionBinding;
    const refreshed = await f.call("/api/v1/auth/session", "GET", undefined, {
      cookie: signed.cookie,
      "x-session-binding": binding,
    });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.body.data.sessionBinding).toBe(binding);
    expect(refreshed.body.data.csrfToken).not.toBe(signed.csrf);
    const malformed = await f.call("/api/v1/auth/session", "GET", undefined, {
      cookie: signed.cookie,
      "x-session-binding": "bad",
    });
    expect(malformed.statusCode).toBe(409);
    const anonymous = await f.call("/api/v1/auth/session", "GET", undefined, {
      "x-session-binding": binding,
    });
    expect(anonymous.statusCode).toBe(401);
  });
  it("successful gate opens do not consume the five-failure allowance", async () => {
    const f = fixture();
    for (let n = 0; n < 8; n++)
      expect(
        (await f.call("/api/v1/auth/gate", "POST", { code: "correct-gate" }))
          .statusCode,
      ).toBe(200);
    for (let n = 0; n < 5; n++)
      expect(
        (await f.call("/api/v1/auth/gate", "POST", { code: "wrong" }))
          .statusCode,
      ).toBe(401);
    const attempts = f.verify.mock.calls.length;
    expect(
      (await f.call("/api/v1/auth/gate", "POST", { code: "correct-gate" }))
        .statusCode,
    ).toBe(429);
    expect(f.verify).toHaveBeenCalledTimes(attempts);
  });
  it("AUTH-TEST-011: gate success reveals validity only and sets a private 15-minute cookie", async () => {
    const f = fixture(),
      r = await f.call("/api/v1/auth/gate", "POST", { code: "correct-gate" });
    expect(r.statusCode).toBe(200);
    expect(r.body.data).toEqual({ gateValid: true });
    expect(JSON.stringify(r.body)).not.toContain("only-server");
    expect(r.getHeader("set-cookie")[0]).toMatch(
      /HttpOnly; Secure; SameSite=Strict; Max-Age=900/,
    );
    expect(r.getHeader("cache-control")).toBe("no-store");
    expect(r.getHeader("x-request-id")).toBe(r.body.meta.requestId);
  });
  it("AUTH-TEST-012: login cannot run without a valid gate", async () => {
    const f = fixture(),
      r = await f.call("/api/v1/auth/login", "POST", {
        email: "fixture@example.test",
        password: "wrong",
      });
    expect(r.statusCode).toBe(403);
    expect(r.body.error.code).toBe("GATE_REQUIRED");
    expect(f.verify).not.toHaveBeenCalled();
  });
  it("AUTH-TEST-013: repeated failures are limited and logged without attempts", async () => {
    const f = fixture();
    for (let n = 0; n < 5; n++)
      expect(
        (await f.call("/api/v1/auth/gate", "POST", { code: "wrong" }))
          .statusCode,
      ).toBe(401);
    const r = await f.call("/api/v1/auth/gate", "POST", {
      code: "correct-gate",
    });
    expect(r.statusCode).toBe(429);
    expect(r.getHeader("retry-after")).toBe("900");
    expect(JSON.stringify(f.store.auditRows)).not.toMatch(
      /wrong|correct-gate|only-server/,
    );
  });
  it("AUTH-TEST-014: login returns no password or raw session token in JSON", async () => {
    const f = fixture(),
      s = await f.login();
    expect(s.result.statusCode).toBe(200);
    expect(s.result.body.data.user.password_hash).toBeUndefined();
    expect(JSON.stringify(s.result.body)).not.toContain(s.cookie.split("=")[1]);
    expect(JSON.stringify([...f.store.sessions.values()])).not.toContain(
      s.cookie.split("=")[1],
    );
  });
  it("AUTH-TEST-015: unsigned identity cookies never authenticate", async () => {
    const f = fixture(),
      r = await f.call("/api/v1/auth/session", "GET", undefined, {
        cookie: 'admin_data={"role":"super_admin"}',
      });
    expect(r.statusCode).toBe(401);
  });
  it("AUTH-TEST-016: missing or unrelated CSRF cannot log a user out", async () => {
    const f = fixture(),
      s = await f.login();
    expect(
      (
        await f.call("/api/v1/auth/session", "DELETE", undefined, {
          cookie: s.cookie,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await f.call("/api/v1/auth/session", "DELETE", undefined, {
          cookie: s.cookie,
          "x-csrf-token": token(),
        })
      ).statusCode,
    ).toBe(403);
    expect([...f.store.sessions.values()][0].revoked).toBe(false);
  });
  it("AUTH-TEST-017: logout revokes the server session and clears both cookies", async () => {
    const f = fixture(),
      s = await f.login(),
      r = await f.call("/api/v1/auth/session", "DELETE", undefined, {
        cookie: s.cookie,
        "x-csrf-token": s.csrf,
      });
    expect(r.statusCode).toBe(200);
    expect(r.getHeader("set-cookie")).toHaveLength(2);
    expect(
      r.getHeader("set-cookie").every((value) => value.includes("Max-Age=0")),
    ).toBe(true);
    expect(
      (
        await f.call("/api/v1/auth/session", "GET", undefined, {
          cookie: s.cookie,
        })
      ).statusCode,
    ).toBe(401);
  });
  it("AUTH-TEST-018: cross-origin and originless mutations are rejected", async () => {
    const f = fixture();
    for (const origin of ["https://evil.example.test", undefined, "null"]) {
      expect(
        (
          await f.call(
            "/api/v1/auth/gate",
            "POST",
            { code: "correct-gate" },
            { origin },
          )
        ).statusCode,
      ).toBe(403);
    }
    expect(f.verify).not.toHaveBeenCalled();
  });
  it("AUTH-TEST-019: disabled accounts and current role changes apply on the next request", async () => {
    const f = fixture(),
      s = await f.login();
    f.store.user.role = "team_member";
    expect(
      (
        await f.call("/api/v1/auth/session", "GET", undefined, {
          cookie: s.cookie,
        })
      ).body.data.user.role,
    ).toBe("team_member");
    f.store.user.is_active = false;
    expect(
      (
        await f.call("/api/v1/auth/session", "GET", undefined, {
          cookie: s.cookie,
        })
      ).statusCode,
    ).toBe(401);
  });
  it("AUTH-TEST-020: unknown JSON properties, oversized input, and methods are rejected safely", async () => {
    const f = fixture();
    expect(
      (
        await f.call("/api/v1/auth/gate", "POST", {
          code: "correct-gate",
          role: "super_admin",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await f.call(
          "/api/v1/auth/gate",
          "POST",
          { code: "correct-gate" },
          { "content-length": "90000" },
        )
      ).statusCode,
    ).toBe(413);
    expect((await f.call("/api/v1/auth/gate", "TRACE")).statusCode).toBe(405);
    const logs = JSON.stringify(f.log.mock.calls);
    expect(logs).not.toMatch(/correct-gate|super_admin|only-server/);
  });
  it("password changes require CSRF and the current password, then rotate bearer and CSRF tokens", async () => {
    const f = fixture(),
      s = await f.login();
    const body = {
      currentPassword: "Correct password! 2026",
      newPassword: "A new long password! 2026",
    };
    expect(
      (
        await f.call("/api/v1/auth/password", "POST", body, {
          cookie: s.cookie,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await f.call(
          "/api/v1/auth/password",
          "POST",
          { ...body, currentPassword: "wrong" },
          { cookie: s.cookie, "x-csrf-token": s.csrf },
        )
      ).statusCode,
    ).toBe(401);
    const result = await f.call("/api/v1/auth/password", "POST", body, {
      cookie: s.cookie,
      "x-csrf-token": s.csrf,
    });
    expect(result.statusCode).toBe(200);
    expect(result.body.data.csrfToken).not.toBe(s.csrf);
    expect(f.cookie(result, config.sessionCookie)).not.toBe(s.cookie);
    expect(
      (
        await f.call("/api/v1/auth/session", "GET", undefined, {
          cookie: s.cookie,
        })
      ).statusCode,
    ).toBe(401);
    expect(f.store.user.password_hash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(result.body)).not.toContain(body.newPassword);
  });
});
