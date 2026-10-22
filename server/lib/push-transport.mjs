import webPush from "web-push";
import { ECDH, createECDH } from "node:crypto";
import { browserPushSubscription } from "../../shared/push.mjs";
import { ApiError } from "./http.mjs";
import { timeDependency } from "./telemetry.mjs";
export function validatePushSubscription(value) {
  const data = browserPushSubscription.parse(value);
  const key = Buffer.from(data.keys.p256dh, "base64url"),
    auth = Buffer.from(data.keys.auth, "base64url");
  if (
    key.length !== 65 ||
    key[0] !== 4 ||
    auth.length !== 16 ||
    auth.toString("base64url") !== data.keys.auth ||
    key.toString("base64url") !== data.keys.p256dh
  )
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "The browser push subscription is invalid.",
    );
  try {
    ECDH.convertKey(key, "prime256v1");
  } catch {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "The browser push encryption key is invalid.",
    );
  }
  return data;
}
export function pushConfig(env = process.env) {
  if (env.PUSH_ENABLED !== "true")
    return { enabled: false, deliveryEnabled: false };
  try {
    if (!/^[A-Za-z0-9_-]{43}$/.test(env.PUSH_VAPID_PRIVATE_KEY || ""))
      throw Error("Invalid private key");
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(
      Buffer.from(env.PUSH_VAPID_PRIVATE_KEY || "", "base64url"),
    );
    if (
      ecdh.getPublicKey().toString("base64url") !== env.PUSH_VAPID_PUBLIC_KEY ||
      !/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.PUSH_VAPID_SUBJECT || "")
    )
      throw Error("Invalid VAPID configuration");
    return {
      enabled: true,
      deliveryEnabled: env.PUSH_SEND_ENABLED === "true",
      publicKey: env.PUSH_VAPID_PUBLIC_KEY,
      vapidDetails: {
        subject: env.PUSH_VAPID_SUBJECT,
        publicKey: env.PUSH_VAPID_PUBLIC_KEY,
        privateKey: env.PUSH_VAPID_PRIVATE_KEY,
      },
    };
  } catch {
    throw new ApiError(
      503,
      "PUSH_NOT_CONFIGURED",
      "Event reminders are not configured.",
    );
  }
}
export function createPushTransport(env = process.env, fetcher = fetch) {
  const config = pushConfig(env);
  return {
    async send(subscription, payload, deliveryId) {
      if (!config.enabled || !config.deliveryEnabled)
        throw new ApiError(503, "PUSH_DISABLED", "Push delivery is disabled.");
      const valid = validatePushSubscription(subscription),
        details = webPush.generateRequestDetails(
          valid,
          JSON.stringify(payload),
          {
            vapidDetails: config.vapidDetails,
            TTL: 1800,
            urgency: "normal",
            topic: deliveryId.replaceAll("-", "").slice(0, 32),
            contentEncoding: "aes128gcm",
          },
        );
      const result = await timeDependency("push", () =>
        fetcher(details.endpoint, {
          method: details.method,
          headers: details.headers,
          body: details.body,
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        }),
      );
      // Never retain raw provider bodies, headers or endpoint URLs in logs/errors.
      await result.body?.cancel();
      return result.status;
    },
  };
}
