import { describe, it, expect, vi } from "vitest";
import { generateKeyPairSync, verify, createPublicKey } from "node:crypto";
import { EventEmitter } from "node:events";
import { appDeviceRegistration, appNotificationPayload } from "../../shared/app-notifications.mjs";
import { appPushConfig, createAppPushTransport, signedProviderToken, providerResult } from "../../server/lib/app-push-transport.mjs";
import { pushNotification, canonicalPushClick } from "../../shared/push-policy.mjs";
import { queueMailAppNotification } from "../../server/app-notifications.mjs";
const id = "f1530000-0000-4000-8000-000000000001";
function appleEnv() {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return { APP_NOTIFICATIONS_ENABLED: "true", APNS_PUSH_ENABLED: "true", APNS_TOPIC: "dev.gdggt.scanner", APNS_TEAM_ID: "7THP95SRTV", APNS_KEY_ID: "FIXTURE123", APNS_SIGNING_KEY: privateKey.export({ format: "pem", type: "pkcs8" }) };
}
describe("account-bound multi-platform notifications", () => {
  it("rejects client-supplied recipient identities and non-provider web addresses", () => {
    const good = { platform: "ios", installationId: id, environment: "production", token: "a".repeat(64), label: "iPhone" };
    expect(appDeviceRegistration.parse(good)).toEqual(good);
    expect(() => appDeviceRegistration.parse({ ...good, userId: id })).toThrow();
    expect(() => appDeviceRegistration.parse({ ...good, token: "https://evil.test/token" })).toThrow();
    expect(() => appDeviceRegistration.parse({ ...good, platform: "web", subscription: { endpoint: "https://127.0.0.1/secret" } })).toThrow();
  });
  it("requires the dedicated app topic and real P256 APNs key", () => {
    const env = appleEnv(); env.APNS_KEY_ID = "FIXTURE123";
    expect(appPushConfig(env).platforms).toEqual(["ios"]);
    expect(appPushConfig(env).public).not.toHaveProperty("apple");
    expect(() => appPushConfig({ ...env, APNS_TOPIC: "another.app" })).toThrow();
    expect(() => appPushConfig({ ...env, APNS_SIGNING_KEY: "not a key" })).toThrow();
    expect(appPushConfig({}).platforms).toEqual([]);
  });
  it("signs Apple's token in IEEE P1363 form without device data", () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const token = signedProviderToken({ alg: "ES256", kid: "FIXTURE1234" }, { iss: "7THP95SRTV", iat: 1 }, privateKey, "ES256"), parts = token.split(".");
    expect(Buffer.from(parts[2], "base64url")).toHaveLength(64);
    expect(verify("sha256", Buffer.from(parts[0] + "." + parts[1]), { key: createPublicKey(privateKey), dsaEncoding: "ieee-p1363" }, Buffer.from(parts[2], "base64url"))).toBe(true);
  });
  it("sends a bounded generic APNs alert to the selected environment and closes its connection", async () => {
    const env = appleEnv(); env.APNS_KEY_ID = "FIXTURE123";
    const sent = [], client = new EventEmitter(); client.destroy = vi.fn();
    client.request = headers => {
      const stream = new EventEmitter(); stream.setEncoding = vi.fn(); stream.setTimeout = vi.fn();
      stream.end = body => { sent.push({ headers, body: JSON.parse(body) }); queueMicrotask(() => { stream.emit("response", { ":status": 200 }); stream.emit("end"); }); }; return stream;
    };
    const connector = vi.fn(() => client), transport = createAppPushTransport(env, vi.fn(), connector), payload = appNotificationPayload({ notificationId: id, category: "forms", badge: 2, answers: "must not leak" });
    expect(await transport.send({ platform: "ios", environment: "production" }, { token: "a".repeat(64) }, payload, id)).toBe("accepted");
    expect(connector).toHaveBeenCalledWith("https://api.push.apple.com");
    expect(sent[0].headers["apns-topic"]).toBe("dev.gdggt.scanner");
    expect(sent[0].body.aps.badge).toBe(2);
    expect(JSON.stringify(sent[0].body)).not.toContain("answers");
    transport.close(); expect(client.destroy).toHaveBeenCalled();
  });
  it("expires invalid registrations, retries temporary failures and avoids secret body logging", () => {
    expect(providerResult(410)).toBe("expired");
    expect(providerResult(400, "BadDeviceToken")).toBe("expired");
    expect(providerResult(404, "UNREGISTERED")).toBe("expired");
    expect(providerResult(429)).toBe("retry");
    expect(providerResult(503)).toBe("retry");
    expect(providerResult(403)).toBe("failed");
  });
  it("ignores untrusted push text and permits only the protected notifications destination", () => {
    const payload = appNotificationPayload({ notificationId: id, category: "forms", badge: 100000, subject: "Private resume", answers: "secret" });
    expect(JSON.stringify(payload)).not.toMatch(/Private resume|secret/);
    expect(payload.badge).toBe(9999);
    const notice = pushNotification({ ...payload, body: "private answers", path: "/admin/notifications" }, "https://gdggt.dev");
    expect(notice.options.body).toBe("You have a new chapter update.");
    expect(canonicalPushClick(notice.options.data.url, "https://gdggt.dev")).toBe("https://gdggt.dev/admin/notifications");
    expect(pushNotification({ ...payload, path: "https://evil.test" }, "https://gdggt.dev")).toBeNull();
  });
  it("mirrors only current prepared emails through the durable job identity", async () => {
    const db = { rpc: vi.fn(async () => ({ data: 1 })) }, job = { id, lease_token: "lease" }, message = { to: "owner@example.test", subject: "Form update", text: "secret answers" };
    await queueMailAppNotification(db, job, message, "forms", { APP_NOTIFICATIONS_ENABLED: "true" });
    expect(db.rpc).toHaveBeenCalledWith("queue_mail_app_notification", { p_job: id, p_lease: "lease", p_email: "owner@example.test", p_subject: "Form update", p_category: "forms", p_chapter: false });
    db.rpc.mockClear(); await queueMailAppNotification(db, job, message, "forms", {}); expect(db.rpc).not.toHaveBeenCalled();
  });
});

describe("app notification API and worker boundaries", () => {
  it("binds device enrollment to the current session and encrypts its token", async () => {
    const { appNotificationRoutes } = await import("../../server/app-notifications.mjs");
    const { tokenHash } = await import("../../server/lib/security.mjs");
    const { decryptPayload } = await import("../../server/lib/encryption.mjs");
    const proof = "s".repeat(43), env = appleEnv(), config = { origin: "https://gdggt.dev", sessionCookie: "__Host-gdg_session", riskSecret: "r".repeat(48), encryptionSecret: "e".repeat(48) };
    const store = { validateSession: vi.fn(async () => ({ sessionId: "current-session", user: { id, is_active: true } })), csrf: vi.fn(async () => ({ token_hash: tokenHash(proof), expires_at: new Date(Date.now() + 60000).toISOString() })), rateLimit: vi.fn(async () => ({ allowed: true })) };
    const db = { rpc: vi.fn(async () => ({ data: id })) }, response = { setHeader: vi.fn(), end: vi.fn() }, request = { url: "/api/v1/admin/app-notifications/devices", method: "POST", headers: { cookie: "__Host-gdg_session=" + "c".repeat(43), "x-csrf-token": proof, "content-type": "application/json" }, body: { platform: "ios", installationId: id, environment: "production", token: "a".repeat(64), label: "My phone" } };
    await appNotificationRoutes(request, response, { db, store, config, requestId: id, env });
    const [name, args] = db.rpc.mock.calls[0]; expect(name).toBe("register_app_notification_device");
    expect(args).toMatchObject({ p_actor: id, p_session: "current-session", p_platform: "ios", p_environment: "production" });
    expect(args.p_encrypted).not.toContain(request.body.token); expect(decryptPayload(args.p_encrypted, config.encryptionSecret)).toEqual({ token: request.body.token });
    db.rpc.mockClear(); request.headers["x-csrf-token"] = "bad";
    await expect(appNotificationRoutes(request, response, { db, store, config, requestId: id, env })).rejects.toMatchObject({ code: "CSRF_INVALID" });
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("skips stale notices and finishes provider results under only the current lease", async () => {
    const { runAppPushWorker } = await import("../../server/app-push-worker.mjs"), { encryptPayload } = await import("../../server/lib/encryption.mjs");
    const env = { ...appleEnv(), APP_ORIGIN: "https://gdggt.dev", RISK_HASH_SECRET: "r".repeat(48), DATA_ENCRYPTION_KEY: "e".repeat(48) };
    let prepared = false;
    const job = { id, lease_token: "current-lease" }, rpc = vi.fn(async (name) => ({ data: name === "claim_worker_jobs" ? [job] : name === "prepare_app_push" ? prepared ? { platform: "ios", environment: "production", notificationId: id, category: "forms", badge: 1, encrypted: encryptPayload({ token: "a".repeat(64) }, env.DATA_ENCRYPTION_KEY) } : null : true }));
    const transport = { send: vi.fn(async () => "accepted"), close: vi.fn() };
    const result = await runAppPushWorker({ db: { rpc }, env, transport }); expect(result.skipped).toBe(1); expect(transport.send).not.toHaveBeenCalled();
    prepared = true; await runAppPushWorker({ db: { rpc }, env, transport });
    expect(rpc).toHaveBeenCalledWith("finish_app_push", { p_job: id, p_lease: "current-lease", p_result: "accepted" });
    expect(transport.send).toHaveBeenCalledOnce(); expect(transport.close).toHaveBeenCalledTimes(2);
  });
});
