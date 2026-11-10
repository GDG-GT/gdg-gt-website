import { connect } from "node:http2";
import { createPrivateKey, sign } from "node:crypto";
import { createPushTransport, pushConfig } from "./push-transport.mjs";
const json64 = value => Buffer.from(JSON.stringify(value)).toString("base64url");
export function signedProviderToken(header, payload, key, algorithm) {
  const input = json64(header) + "." + json64(payload);
  return input + "." + sign("sha256", Buffer.from(input), algorithm === "ES256" ? { key, dsaEncoding: "ieee-p1363" } : key).toString("base64url");
}
function privateKey(value, passphrase, type) {
  const key = createPrivateKey({ key: value, ...(passphrase ? { passphrase } : {}) });
  if (key.asymmetricKeyType !== type || (type === "ec" && key.asymmetricKeyDetails?.namedCurve !== "prime256v1")) throw Error("Invalid push signing key");
  return key;
}
export function appPushConfig(env = process.env) {
  const enabled = env.APP_NOTIFICATIONS_ENABLED === "true", platforms = [];
  let apple, web;
  if (enabled) {
    if (env.APNS_PUSH_ENABLED === "true") {
      if (!/^[A-Z0-9]{10}$/.test(env.APNS_TEAM_ID || "") || !/^[A-Z0-9]{10}$/.test(env.APNS_KEY_ID || "") || env.APNS_TOPIC !== "dev.gdggt.scanner") throw Error("APNs configuration is incomplete");
      apple = { key: privateKey(env.APNS_SIGNING_KEY, env.APNS_KEY_PASSPHRASE, "ec"), team: env.APNS_TEAM_ID, keyId: env.APNS_KEY_ID, topic: env.APNS_TOPIC }; platforms.push("ios");
    }
    if (env.PUSH_ENABLED === "true") {
      web = pushConfig(env);
      if (web.deliveryEnabled) platforms.push("web");
    }
  }
  return { enabled, platforms, apple, public: { ios: platforms.includes("ios"), web: platforms.includes("web"),
    ...(platforms.includes("web") ? { publicKey: web.publicKey } : {}) } };
}
// Return only a result class. Never log a device token, endpoint or provider body.
export function providerResult(status, reason = "") {
  if ([200, 201, 202].includes(status)) return "accepted";
  if (["Unregistered", "BadDeviceToken", "DeviceTokenNotForTopic", "UNREGISTERED"].includes(reason) || status === 410) return "expired";
  if (status === 429 || status >= 500 || status === 0) return "retry";
  return "failed";
}
export function createAppPushTransport(env = process.env, fetcher = fetch, connector = connect) {
  const config = appPushConfig(env), sessions = new Map();
  let appleToken, appleExpires = 0;
  return {
    async send(notice, address, payload, deliveryId) {
      if (!config.platforms.includes(notice.platform)) return "retry";
      if (notice.platform === "web") {
        const status = await createPushTransport(env, fetcher).send(address, payload, deliveryId);
        return [404, 410].includes(status) ? "expired" : providerResult(status);
      }
      if (notice.platform === "ios") {
        if (!/^[a-f0-9]{64,200}$/.test(address.token || "")) return "expired";
        const now = Math.floor(Date.now() / 1000);
        if (!appleToken || now >= appleExpires) { appleToken = signedProviderToken({ alg: "ES256", kid: config.apple.keyId }, { iss: config.apple.team, iat: now }, config.apple.key, "ES256"); appleExpires = now + 2700; }
        const host = notice.environment === "sandbox" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
        let client = sessions.get(host);
        if (!client || client.closed || client.destroyed) {
          client = connector(host); client.on("error", () => {}); client.setTimeout?.(10000, () => client.destroy()); sessions.set(host, client);
        }
        return new Promise((resolve, reject) => {
          let status = 0, response = "";
          const stream = client.request({ ":method": "POST", ":path": "/3/device/" + address.token, authorization: "bearer " + appleToken, "apns-topic": config.apple.topic,
            "apns-push-type": "alert", "apns-priority": "10", "apns-expiration": String(now + 86400), "apns-id": deliveryId, "apns-collapse-id": deliveryId });
          stream.setEncoding("utf8"); stream.setTimeout(8000, () => { stream.close(); reject(Error("APNs timeout")); });
          stream.on("response", headers => { status = Number(headers[":status"]); });
          stream.on("data", chunk => { if (response.length < 4096) response += chunk; });
          stream.on("error", () => reject(Error("APNs request failed")));
          stream.on("end", () => { let reason = ""; try { reason = JSON.parse(response).reason; } catch { /* A provider response may have no JSON body. */ } resolve(providerResult(status, reason)); });
          stream.end(JSON.stringify({ aps: { alert: { title: payload.title, body: payload.body }, sound: "default", badge: payload.badge, "thread-id": "gdg-workspace" }, type: payload.type, notificationId: payload.notificationId }));
        });
      }
      return "failed";
    },
    close() { for (const session of sessions.values()) session.destroy(); sessions.clear(); },
  };
}
