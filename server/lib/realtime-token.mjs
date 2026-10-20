import { createHmac, createPrivateKey, sign } from "node:crypto";
import { ApiError } from "./http.mjs";
function notConfigured() {
  return new ApiError(
    503,
    "REALTIME_NOT_CONFIGURED",
    "Live updates are not configured. Protected API refresh remains available.",
  );
}
export function realtimeConfiguration(env = process.env) {
  const url = env.SUPABASE_URL,
    key = env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw notConfigured();
  let endpoint;
  try {
    endpoint = new URL(url);
  } catch {
    throw notConfigured();
  }
  const local =
    env.NODE_ENV === "development" &&
    endpoint.origin === "http://127.0.0.1:54361" &&
    env.APP_ORIGIN === "http://127.0.0.1:8080";
  if (
    endpoint.username ||
    endpoint.password ||
    (!local && endpoint.protocol !== "https:")
  )
    throw notConfigured();
  if (!key.startsWith("sb_publishable_")) {
    let role;
    try {
      role = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString(),
      ).role;
    } catch {
      throw notConfigured();
    }
    if (role !== "anon") throw notConfigured();
  }
  if (
    local &&
    env.ALLOW_LOCAL_REALTIME_HS256 === "true" &&
    env.REALTIME_LOCAL_JWT_SECRET?.length >= 32
  )
    return {
      url: endpoint.origin,
      key,
      algorithm: "HS256",
      signingKey: env.REALTIME_LOCAL_JWT_SECRET,
    };
  if (!env.REALTIME_JWT_PRIVATE_JWK || !env.REALTIME_JWT_KEY_ID)
    throw notConfigured();
  try {
    const jwk = JSON.parse(env.REALTIME_JWT_PRIVATE_JWK);
    if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.d)
      throw notConfigured();
    return {
      url: endpoint.origin,
      key,
      algorithm: "ES256",
      kid: env.REALTIME_JWT_KEY_ID,
      signingKey: createPrivateKey({ key: jwk, format: "jwk" }),
    };
  } catch {
    throw notConfigured();
  }
}
export function signRealtimeGrant(
  configuration,
  grant,
  userId,
  sessionId,
  issuer,
) {
  if (
    !Number.isSafeInteger(grant.issuedAt) ||
    !Number.isSafeInteger(grant.expiresAt) ||
    !Number.isSafeInteger(grant.permissionVersion) ||
    grant.permissionVersion < 0 ||
    !/^gdg:(channel|whiteboard|direct-thread|user):[0-9a-f-]{36}$/.test(grant.topic || "") ||
    grant.expiresAt <= grant.issuedAt ||
    grant.expiresAt > grant.issuedAt + 300
  )
    throw notConfigured();
  const header = {
      alg: configuration.algorithm,
      typ: "JWT",
      ...(configuration.kid ? { kid: configuration.kid } : {}),
    },
    claims = {
      iss: issuer,
      aud: "authenticated",
      sub: userId,
      role: "gdg_realtime",
      session_id: sessionId,
      jti: grant.id,
      permission_version: grant.permissionVersion,
      topics: [grant.topic],
      iat: grant.issuedAt,
      exp: grant.expiresAt,
    };
  const content =
    Buffer.from(JSON.stringify(header)).toString("base64url") +
    "." +
    Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature =
    configuration.algorithm === "HS256"
      ? createHmac("sha256", configuration.signingKey).update(content).digest()
      : sign("sha256", Buffer.from(content), {
          key: configuration.signingKey,
          dsaEncoding: "ieee-p1363",
        });
  return content + "." + signature.toString("base64url");
}
