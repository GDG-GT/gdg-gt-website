import { ApiError } from "./lib/http.mjs";

export function serverConfig(env = process.env) {
  let origin;
  try {
    origin = new URL(env.APP_ORIGIN);
  } catch {
    throw new ApiError(
      503,
      "TEMPORARILY_UNAVAILABLE",
      "Server configuration is incomplete.",
    );
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (
    origin.href !== origin.origin + "/" ||
    origin.username ||
    origin.password ||
    (origin.protocol !== "https:" &&
      !(local && env.NODE_ENV !== "production" && origin.protocol === "http:"))
  ) {
    throw new ApiError(
      503,
      "TEMPORARILY_UNAVAILABLE",
      "Server configuration is incomplete.",
    );
  }
  const insecure = env.ALLOW_INSECURE_LOCAL_COOKIES === "true";
  if (insecure && (!local || env.NODE_ENV === "production"))
    throw new ApiError(
      503,
      "TEMPORARILY_UNAVAILABLE",
      "Server configuration is incomplete.",
    );
  if (!env.RISK_HASH_SECRET || env.RISK_HASH_SECRET.length < 32)
    throw new ApiError(
      503,
      "TEMPORARILY_UNAVAILABLE",
      "Server configuration is incomplete.",
    );
  return {
    origin: origin.origin,
    riskSecret: env.RISK_HASH_SECRET,
    initialGateHash: env.ADMIN_GATE_SECRET_HASH,
    encryptionSecret: env.DATA_ENCRYPTION_KEY,
    secureCookies: !insecure,
    gateCookie: insecure ? "gdg_dev_gate" : "__Host-gdg_gate",
    sessionCookie: insecure ? "gdg_dev_session" : "__Host-gdg_session",
  };
}
