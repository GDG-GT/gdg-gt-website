import {
  createPrivateKey,
  createPublicKey,
  createHash,
  sign,
} from "node:crypto";
import { ApiError } from "./lib/http.mjs";

export function googleWalletConfiguration(env = process.env) {
  if (env.GOOGLE_WALLET_ENABLED !== "true") return null;
  try {
    const issuer = env.GOOGLE_WALLET_ISSUER_ID || "";
    const email = env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL || "";
    if (
      !/^[0-9]{6,30}$/.test(issuer) ||
      !/^[a-zA-Z0-9._-]+@[a-zA-Z0-9-]+\.iam\.gserviceaccount\.com$/.test(email)
    )
      return null;
    const key = createPrivateKey({
      key: (env.GOOGLE_WALLET_SERVICE_ACCOUNT_KEY || "").replaceAll(
        "\\n",
        "\n",
      ),
      passphrase: env.GOOGLE_WALLET_KEY_PASSPHRASE,
    });
    if (
      key.asymmetricKeyType !== "rsa" ||
      key.asymmetricKeyDetails.modulusLength < 2048
    )
      return null;
    return {
      issuer,
      email,
      key,
      approved: env.GOOGLE_WALLET_PUBLISHING_APPROVED === "true",
      smartTap: googleSmartTapConfiguration(env),
    };
  } catch {
    return null;
  }
}

/** Smart Tap is separate from Apple VAS and is never enabled by QR configuration. */
export function googleSmartTapConfiguration(env = process.env) {
  if (env.GOOGLE_WALLET_SMART_TAP_ENABLED !== "true") return null;
  const issuers = (env.GOOGLE_WALLET_REDEMPTION_ISSUER_IDS || "")
    .split(",")
    .map((v) => v.trim());
  if (
    env.GOOGLE_WALLET_SMART_TAP_READER_READY !== "true" ||
    issuers.length > 10 ||
    issuers.some(
      (id) => !/^[0-9]{6,19}$/.test(id) || BigInt(id) > 9223372036854775807n,
    )
  )
    return null;
  return { redemptionIssuers: [...new Set(issuers)] };
}

/** Google signs in only to save a pass. Chapter membership authentication is unchanged. */
export async function generateGoogleMemberPass({
  credential,
  id,
  name,
  env = process.env,
  now = Date.now(),
  fetchImpl = fetch,
}) {
  const config = googleWalletConfiguration(env);
  if (!config)
    throw new ApiError(
      503,
      "GOOGLE_WALLET_UNAVAILABLE",
      "Google Wallet is awaiting issuer configuration.",
    );
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(credential) ||
    !/^[0-9a-f-]{36}$/.test(id) ||
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 200
  )
    throw new ApiError(
      400,
      "INVALID_WALLET_PASS",
      "This membership pass could not be created.",
    );
  const localized = (value) => ({ defaultValue: { language: "en-US", value } });
  const classId = config.issuer + ".gdg_membership";
  const payload = {
    iss: config.email,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(now / 1000),
    origins: ["https://gdggt.dev", "https://leaderboards.gdggt.dev"],
    payload: {
      genericClasses: [
        {
          id: classId,
          ...(config.smartTap
            ? {
                enableSmartTap: true,
                redemptionIssuers: config.smartTap.redemptionIssuers,
              }
            : {}),
        },
      ],
      genericObjects: [
        {
          id: config.issuer + ".member_" + id.replaceAll("-", ""),
          classId,
          state: "ACTIVE",
          genericType: "GENERIC_OTHER",
          cardTitle: localized("GDG at Georgia Tech"),
          subheader: localized("CHAPTER MEMBER"),
          header: localized(name),
          hexBackgroundColor: "#FAEFE5",
          logo: {
            sourceUri: { uri: "https://gdggt.dev/logo.png" },
            contentDescription: localized("GDG at Georgia Tech"),
          },
          barcode: {
            type: "QR_CODE",
            value: credential,
            alternateText: "GDG chapter membership",
          },
          ...(config.smartTap ? { smartTapRedemptionValue: credential } : {}),
          linksModuleData: {
            uris: [
              {
                id: "member-account",
                uri: "https://leaderboards.gdggt.dev/member",
                description: "Member account",
              },
            ],
          },
          textModulesData: [
            {
              id: "chapter",
              header: "COMMUNITY",
              body: "GDG on Campus at Georgia Tech",
            },
          ],
        },
      ],
    },
  };
  const access = await accessToken(config, fetchImpl, now);
  await upsert(
    "genericClass",
    payload.payload.genericClasses[0],
    access,
    fetchImpl,
  );
  if (config.smartTap) {
    const enabled = await providerRequest(
      "https://walletobjects.googleapis.com/walletobjects/v1/genericClass/" +
        encodeURIComponent(classId),
      {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + access,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          enableSmartTap: true,
          redemptionIssuers: config.smartTap.redemptionIssuers,
        }),
      },
      fetchImpl,
    );
    if (enabled.status !== 200)
      throw new ApiError(
        503,
        "GOOGLE_WALLET_UNAVAILABLE",
        "Google Wallet NFC could not be configured. Contact the chapter.",
      );
  }
  await upsert(
    "genericObject",
    payload.payload.genericObjects[0],
    access,
    fetchImpl,
  );
  payload.payload = {
    genericObjects: [{ id: payload.payload.genericObjects[0].id }],
  };
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const data =
    header + "." + Buffer.from(JSON.stringify(payload)).toString("base64url");
  const jwt =
    data +
    "." +
    sign("RSA-SHA256", Buffer.from(data), config.key).toString("base64url");
  return "https://pay.google.com/gp/v/save/" + jwt;
}

const tokens = new Map();
const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
function jwt(config, payload) {
  const input = encode({ alg: "RS256", typ: "JWT" }) + "." + encode(payload);
  return (
    input +
    "." +
    sign("RSA-SHA256", Buffer.from(input), config.key).toString("base64url")
  );
}
async function providerRequest(url, options, fetchImpl) {
  try {
    const response = await fetchImpl(url, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    if (text.length > 262144) throw Error("Response too large");
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw Error("Invalid provider response");
    }
    return { status: response.status, body };
  } catch {
    throw new ApiError(
      503,
      "GOOGLE_WALLET_UNAVAILABLE",
      "Google Wallet could not be reached. Try again.",
    );
  }
}
async function accessToken(config, fetchImpl, now) {
  const fingerprint = createHash("sha256")
    .update(createPublicKey(config.key).export({ type: "spki", format: "der" }))
    .digest("hex");
  const cacheKey = config.email + ":" + fingerprint;
  const cached = tokens.get(cacheKey);
  if (cached && cached.expires > now + 120000) return cached.value;
  const assertion = jwt(config, {
    iss: config.email,
    scope: "https://www.googleapis.com/auth/wallet_object.issuer",
    aud: "https://oauth2.googleapis.com/token",
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + 3600,
  });
  const result = await providerRequest(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    },
    fetchImpl,
  );
  if (
    result.status !== 200 ||
    typeof result.body.access_token !== "string" ||
    result.body.access_token.length > 8192 ||
    !Number.isFinite(result.body.expires_in)
  )
    throw new ApiError(
      503,
      "GOOGLE_WALLET_UNAVAILABLE",
      "Google Wallet issuer authentication failed.",
    );
  if (tokens.size >= 8) tokens.clear();
  tokens.set(cacheKey, {
    value: result.body.access_token,
    expires: now + Math.min(3600, result.body.expires_in) * 1000,
  });
  return result.body.access_token;
}
async function upsert(resource, document, token, fetchImpl) {
  const base =
    "https://walletobjects.googleapis.com/walletobjects/v1/" + resource;
  const headers = {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  };
  // Classes are shared immutable templates. Objects have stable credential IDs.
  let result = await providerRequest(
    base + "/" + encodeURIComponent(document.id),
    resource === "genericClass"
      ? { method: "GET", headers }
      : { method: "PUT", headers, body: JSON.stringify(document) },
    fetchImpl,
  );
  if (result.status === 404) {
    result = await providerRequest(
      base,
      { method: "POST", headers, body: JSON.stringify(document) },
      fetchImpl,
    );
    if (result.status === 409)
      result = await providerRequest(
        base + "/" + encodeURIComponent(document.id),
        resource === "genericClass"
          ? { method: "GET", headers }
          : { method: "PUT", headers, body: JSON.stringify(document) },
        fetchImpl,
      );
  }
  if (![200, 201].includes(result.status))
    throw new ApiError(
      503,
      "GOOGLE_WALLET_UNAVAILABLE",
      "Google Wallet could not prepare this pass. Try again or contact the chapter.",
    );
}
