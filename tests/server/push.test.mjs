import { describe, it, expect, vi } from "vitest";
import { createECDH, randomBytes } from "node:crypto";
import webPush from "web-push";
import {
  approvedPushEndpoint,
  browserPushSubscription,
  pushSubscribe,
  pushNotification,
  canonicalPushClick,
} from "../../shared/push.mjs";
import {
  validatePushSubscription,
  pushConfig,
  createPushTransport,
} from "../../server/lib/push-transport.mjs";
import { runPushWorker } from "../../server/push-worker.mjs";
import { encryptPayload } from "../../server/lib/encryption.mjs";
const id = "f9000000-0000-4000-8000-000000000001",
  origin = "https://chapter.example.test";
function fixture() {
  const receiver = createECDH("prime256v1");
  receiver.generateKeys();
  const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/fictional-test-only",
      keys: {
        p256dh: receiver.getPublicKey().toString("base64url"),
        auth: randomBytes(16).toString("base64url"),
      },
    },
    keys = webPush.generateVAPIDKeys(),
    env = {
      PUSH_ENABLED: "true",
      PUSH_SEND_ENABLED: "true",
      PUSH_VAPID_PUBLIC_KEY: keys.publicKey,
      PUSH_VAPID_PRIVATE_KEY: keys.privateKey,
      PUSH_VAPID_SUBJECT: "mailto:fictional@example.test",
    };
  return { subscription, env };
}
describe("verified event push boundaries", () => {
  it("allows only known HTTPS push hosts, never an arbitrary fetch target", () => {
    for (const endpoint of [
      "https://fcm.googleapis.com/fcm/send/id",
      "https://updates.push.services.mozilla.com/wpush/v2/id",
      "https://web.push.apple.com/id",
      "https://server.notify.windows.com/w/?token=id",
    ])
      expect(approvedPushEndpoint(endpoint), endpoint).toBe(true);
    for (const endpoint of [
      "http://fcm.googleapis.com/a",
      "https://127.0.0.1/a",
      "https://fcm.googleapis.com.evil.test/a",
      "https://evilfcm.googleapis.com/a",
      "https://user@fcm.googleapis.com/a",
      "https://fcm.googleapis.com:8443/a",
      "https://fcm.googleapis.com/a#secret",
      "https://fc\nm.googleapis.com/a",
    ])
      expect(approvedPushEndpoint(endpoint), endpoint).toBe(false);
  });
  it("rejects caller-owned identities, events by slug and arbitrary cryptographic/provider options", () => {
    const { subscription } = fixture(),
      body = { eventId: id, subscription };
    expect(pushSubscribe.parse(body)).toEqual(body);
    for (const extra of [
      { userId: id },
      { email: "forged@example.test" },
      { registrationId: id },
      { vapid: "forged" },
    ])
      expect(pushSubscribe.safeParse({ ...body, ...extra }).success).toBe(
        false,
      );
    expect(
      browserPushSubscription.safeParse({
        ...subscription,
        keys: { ...subscription.keys, privateKey: "no" },
      }).success,
    ).toBe(false);
  });
  it("validates canonical browser key lengths and actual P-256 curve points", () => {
    const { subscription } = fixture();
    expect(validatePushSubscription(subscription)).toEqual(subscription);
    const invalid = Buffer.alloc(65);
    invalid[0] = 4;
    expect(() =>
      validatePushSubscription({
        ...subscription,
        keys: { ...subscription.keys, p256dh: invalid.toString("base64url") },
      }),
    ).toThrow();
    expect(() =>
      validatePushSubscription({
        ...subscription,
        keys: { ...subscription.keys, auth: "a".repeat(22) },
      }),
    ).toThrow();
  });
  it("fails closed on missing/mismatched VAPID configuration and never exposes a private key in public config selection", () => {
    const { env } = fixture();
    expect(pushConfig({})).toEqual({ enabled: false, deliveryEnabled: false });
    expect(() =>
      pushConfig({ ...env, PUSH_VAPID_PUBLIC_KEY: "wrong" }),
    ).toThrow();
    expect(pushConfig(env).publicKey).toBe(env.PUSH_VAPID_PUBLIC_KEY);
    expect(
      pushConfig({ ...env, PUSH_SEND_ENABLED: "false" }).deliveryEnabled,
    ).toBe(false);
  });
  it("uses actual Web Push encryption and VAPID signing without sending externally", async () => {
    const { env, subscription } = fixture(),
      fetcher = vi.fn(async (url, options) => {
        expect(url).toBe(subscription.endpoint);
        expect(options.redirect).toBe("error");
        expect(options.signal).toBeInstanceOf(AbortSignal);
        expect(options.headers["Content-Encoding"]).toBe("aes128gcm");
        expect(options.headers.Authorization).toMatch(/^vapid /);
        expect(options.headers.TTL).toBe(1800);
        expect(
          Buffer.from(options.body).includes(
            Buffer.from("fictional-private-test-payload"),
          ),
        ).toBe(false);
        return new Response("", { status: 201 });
      });
    expect(
      await createPushTransport(env, fetcher).send(
        subscription,
        { type: "event-reminder", text: "fictional-private-test-payload" },
        id,
      ),
    ).toBe(201);
    expect(fetcher).toHaveBeenCalledOnce();
    await expect(
      createPushTransport({ ...env, PUSH_SEND_ENABLED: "false" }, fetcher).send(
        subscription,
        {},
        id,
      ),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("keeps lock-screen content generic and restricts notification clicks to canonical event routes", () => {
    const value = pushNotification(
      {
        type: "event-reminder",
        slug: "fictional-event",
        occurrence: "2026-11-01T12:00:00Z",
        email: "never-shown@example.test",
        url: "https://evil.test",
      },
      origin,
    );
    expect(value.options.data.url).toBe(origin + "/events/fictional-event");
    expect(JSON.stringify(value)).not.toContain("@");
    expect(
      pushNotification(
        { type: "event-reminder", slug: "../admin", occurrence: "2026-11-01" },
        origin,
      ),
    ).toBeNull();
    for (const url of [
      "https://evil.test/events/one",
      "/admin",
      "/events/one?token=private",
      "javascript:alert(1)",
    ])
      expect(canonicalPushClick(url, origin)).toBe(origin + "/events");
  });
  it("claims only push jobs, decrypts privately and records provider expiry without copying endpoint errors", async () => {
    const { env, subscription } = fixture(),
      configEnv = {
        ...env,
        NODE_ENV: "development",
        APP_ORIGIN: "http://127.0.0.1:8080",
        SUPABASE_URL: "http://127.0.0.1:54361",
        RISK_HASH_SECRET: "r".repeat(40),
        DATA_ENCRYPTION_KEY: "e".repeat(40),
        ALLOW_INSECURE_LOCAL_COOKIES: "true",
      },
      calls = [],
      db = {
        rpc: async (name, args) => {
          calls.push([name, args]);
          return {
            data:
              name === "claim_event_push_jobs"
                ? [{ id, lease_token: id, attempt_count: 1 }]
                : name === "prepare_event_push"
                  ? {
                      deliveryId: id,
                      encrypted: encryptPayload(
                        subscription,
                        configEnv.DATA_ENCRYPTION_KEY,
                      ),
                      slug: "fictional",
                      eventStart: "2026-11-01T12:00:00Z",
                    }
                  : true,
          };
        },
      },
      transport = {
        send: vi.fn(async (s) => {
          expect(s).toEqual(subscription);
          return 410;
        }),
      };
    const outcome = await runPushWorker({ env: configEnv, db, transport });
    expect(outcome.expired).toBe(1);
    expect(calls[0][0]).toBe("claim_event_push_jobs");
    expect(calls.at(-1)[1].p_result).toBe("expired");
    expect(JSON.stringify(calls)).not.toContain(subscription.endpoint);
  });
});
