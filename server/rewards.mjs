import {
  googleWalletConfiguration,
  generateGoogleMemberPass,
} from "./rewards-google-wallet.mjs";
import { walletReaderRoute } from "./rewards-wallet-reader.mjs";
import { walletConfiguration, generateMemberPass } from "./rewards-wallet.mjs";
import { rewardsPagePaths } from "../shared/rewards-pages.mjs";
import { emailedPass } from "./rewards-email.mjs";
import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  queryValues,
  uuid,
  idempotency,
} from "./lib/validation.mjs";
import {
  token,
  tokenHash,
  riskHash,
  readCookie,
  equalHashes,
  appendCookie,
  authCookie,
} from "./lib/security.mjs";
import { encryptPayload, decryptPayload } from "./lib/encryption.mjs";
import {
  rewardAdminSchemas,
  rewardMemberSchemas,
  cardUrl,
} from "../shared/rewards.mjs";
const sessionCookie = (c) =>
  c.secureCookies ? "__Host-gdg_rewards" : "gdg_dev_rewards";
const csrfCookie = (c) =>
  c.secureCookies ? "__Host-gdg_rewards_csrf" : "gdg_dev_rewards_csrf";
const flowCookie = (c) =>
  c.secureCookies ? "__Host-gdg_rewards_flow" : "gdg_dev_rewards_flow";
const notConnected = () =>
  new ApiError(
    503,
    "SSO_UNAVAILABLE",
    "Georgia Tech sign-in is awaiting campus configuration.",
  );
export function rewardsOrigin(request, config) {
  const candidate = config.rewardsOrigin || config.origin;
  return request.headers.host === new URL(candidate).host
    ? candidate
    : config.origin;
}
const providerConfig = (env) => {
  if (
    env.GT_MEMBER_SSO_ENABLED !== "true" ||
    !/^custom:[a-z0-9-]{2,40}$/.test(env.GT_MEMBER_SSO_PROVIDER || "") ||
    !env.SUPABASE_URL ||
    !env.SUPABASE_PUBLISHABLE_KEY
  )
    return null;
  const u = new URL(env.SUPABASE_URL);
  if (u.protocol !== "https:") return null;
  return {
    url: u.origin,
    key: env.SUPABASE_PUBLISHABLE_KEY,
    provider: env.GT_MEMBER_SSO_PROVIDER,
  };
};
export function verifiedGtIdentity(user, provider, startedAt) {
  const identities =
    user?.identities?.filter((i) => i.provider === provider) || [];
  if (
    identities.length !== 1 ||
    !user.email_confirmed_at ||
    !user.email?.toLowerCase().endsWith("@gatech.edu")
  )
    throw new ApiError(
      403,
      "MEMBERSHIP_REQUIRED",
      "Use the Georgia Tech account listed in the chapter member directory.",
    );
  const i = identities[0],
    d = i.identity_data;
  if (
    d?.email_verified !== true ||
    d.email?.trim().toLowerCase() !== user.email.trim().toLowerCase() ||
    typeof i.provider_id !== "string" ||
    !i.provider_id ||
    Date.parse(i.last_sign_in_at || "") < startedAt - 10000 ||
    !Number.isFinite(Date.parse(i.last_sign_in_at || ""))
  )
    throw new ApiError(
      403,
      "MEMBERSHIP_REQUIRED",
      "Your campus identity could not be verified.",
    );
  return {
    email: d.email.trim().toLowerCase(),
    subject: provider + ":" + i.provider_id,
  };
}
async function quota(store, request, response, config, scope, limit = 120) {
  const risk = riskHash(
    String(
      request.socket?.remoteAddress ||
        request.headers["x-real-ip"] ||
        "unknown",
    ),
    config.riskSecret,
  );
  const r = await store.rateLimit(scope, risk, limit, 60);
  if (!r.allowed) {
    response.setHeader("Retry-After", String(r.retryAfter));
    throw new ApiError(429, "RATE_LIMITED", "Please wait before trying again.");
  }
}
async function downloadMemberPass({
  provider = "apple",
  fetchImpl = fetch,
  id,
  memberId,
  db,
  config,
  request,
  response,
  env,
}) {
  const lookup = () => {
    let query = db
      .from("reward_credentials")
      .select("id,encrypted_token,members!inner(name)")
      .eq("id", id)
      .eq("kind", "wallet")
      .is("revoked_at", null)
      .eq("members.is_active", true)
      .is("members.deleted_at", null)
      .is("members.merged_into_id", null);
    if (memberId) query = query.eq("member_id", memberId);
    return query.maybeSingle();
  };
  const credential = checked(await lookup());
  if (!credential)
    throw new ApiError(
      404,
      "NOT_FOUND",
      "This Wallet credential is not available.",
    );
  const payload = decryptPayload(
    credential.encrypted_token,
    config.encryptionSecret,
  );
  const generate =
    provider === "google" ? generateGoogleMemberPass : generateMemberPass;
  const bytes = await generate({
    credential: payload.credential,
    id: credential.id,
    name: credential.members.name,
    origin: rewardsOrigin(request, config),
    fetchImpl,
    env,
  });
  if (!checked(await lookup()))
    throw new ApiError(
      404,
      "NOT_FOUND",
      "This Wallet credential is not available.",
    );
  response.statusCode = 200;
  if (provider === "google") {
    response.statusCode = 303;
    response.setHeader("Location", bytes);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.end();
    return true;
  }
  response.setHeader("Content-Type", "application/vnd.apple.pkpass");
  response.setHeader(
    "Content-Disposition",
    'attachment; filename="gdg-member.pkpass"',
  );
  response.setHeader("Cache-Control", "no-store");
  response.end(bytes);
  return true;
}
export async function rewardsRoutes(
  request,
  response,
  { db, store, config, requestId, env = process.env, fetchImpl = fetch },
) {
  const url = new URL(request.url, config.origin),
    path = url.pathname;
  if (
    !path.startsWith("/api/v1/rewards/") &&
    !path.startsWith("/api/v1/admin/rewards")
  )
    return false;
  const reply = (data) => {
    sendJson(response, 200, data, requestId);
    return true;
  };
  if (path === "/api/v1/rewards/email-pass") {
    allowMethod(request, response, ["POST"]);
    await quota(store, request, response, config, "rewards.email-pass", 60);
    if (request.headers.origin !== rewardsOrigin(request, config))
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Open this link on the chapter member website.",
      );
    const input = await jsonBody(
      request,
      z
        .object({
          ticket: z.string().max(128),
          provider: z.enum(["info", "qr", "apple", "google"]),
        })
        .strict(),
      1024,
    );
    const result = await emailedPass({ ...input, db, config, env, fetchImpl });
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    if (input.provider === "apple") {
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/vnd.apple.pkpass");
      response.setHeader(
        "Content-Disposition",
        'attachment; filename="GDG-Membership.pkpass"',
      );
      response.end(result);
      return true;
    }
    return reply(input.provider === "google" ? { url: result } : result);
  }
  if (path.startsWith("/api/v1/admin/rewards")) {
    const session = await requireSession(request, store, config);
    if (session.user.role !== "super_admin")
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Only Super Admins can manage member points and cards.",
      );
    await quota(store, request, response, config, "rewards.admin", 120);
    const route = path.slice("/api/v1/admin/rewards".length);
    const existingCard = route.match(/^\/card\/([0-9a-f-]{36})$/);
    if (existingCard) {
      allowMethod(request, response, ["GET"]);
      const id = uuid.parse(existingCard[1]);
      const row = checked(
        await db
          .from("reward_credentials")
          .select("encrypted_token")
          .eq("id", id)
          .eq("kind", "card")
          .is("revoked_at", null)
          .maybeSingle(),
      );
      if (!row)
        throw new ApiError(404, "NOT_FOUND", "This card is not available.");
      const { credential } = decryptPayload(
        row.encrypted_token,
        config.encryptionSecret,
      );
      checked(
        await db.rpc("reward_resolve", {
          p_actor: session.user.id,
          p_session: session.sessionId,
          p_hash: tokenHash(credential),
        }),
      );
      return reply({
        id,
        kind: "card",
        credential,
        url: cardUrl(config.origin, credential),
      });
    }
    const walletDownload = route.match(
      /^\/(wallet|google-wallet)\/([0-9a-f-]{36})$/,
    );
    if (walletDownload) {
      allowMethod(request, response, ["GET"]);
      return downloadMemberPass({
        provider: walletDownload[1] === "google-wallet" ? "google" : "apple",
        fetchImpl,
        id: uuid.parse(walletDownload[2]),
        db,
        config,
        request,
        response,
        env,
      });
    }
    if (route === "") {
      allowMethod(request, response, ["GET"]);
      const q = queryValues(
        url.searchParams,
        z
          .object({
            q: z.string().max(100).optional(),
            page: z.coerce.number().int().min(1).max(10000).default(1),
            member: uuid.optional(),
          })
          .strict(),
      );
      const inventory = checked(
        await db.rpc("reward_admin_read", {
          p_actor: session.user.id,
          p_session: session.sessionId,
          p_query: q.q || "",
          p_page: q.page,
          p_member: q.member || null,
        }),
      );
      const wallet = walletConfiguration(env);
      return reply({
        ...inventory,
        emailDeliveries: q.member
          ? checked(
              await db.rpc("reward_email_status", {
                p_actor: session.user.id,
                p_session: session.sessionId,
                p_member: q.member,
              }),
            )
          : [],
        walletAvailable: !!wallet,
        walletNfcAvailable: !!wallet?.nfcEnabled,
        googleWalletAvailable: !!googleWalletConfiguration(env),
      });
    }
    if (
      ["/wallet-reader", "/wallet-challenge", "/wallet-read"].includes(route)
    ) {
      if (route !== "/wallet-reader")
        await requireCsrf(request, session, store);
      return walletReaderRoute(route, request, {
        session,
        config,
        db,
        env,
        reply,
        response,
      });
    }
    allowMethod(request, response, ["POST"]);
    await requireCsrf(request, session, store);
    if (route === "/credential-email") {
      const { id } = await jsonBody(
        request,
        z.object({ id: uuid }).strict(),
        512,
      );
      return reply(
        checked(
          await db.rpc("queue_reward_credential_email", {
            p_actor: session.user.id,
            p_session: session.sessionId,
            p_credential: id,
            p_key_hash: tokenHash(idempotency(request)),
          }),
        ),
      );
    }
    if (route === "/resolve") {
      const d = await jsonBody(
        request,
        z
          .object({ credential: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
          .strict(),
        1024,
      );
      return reply(
        checked(
          await db.rpc("reward_resolve", {
            p_actor: session.user.id,
            p_session: session.sessionId,
            p_hash: tokenHash(d.credential),
          }),
        ),
      );
    }
    const action = route.slice(1),
      schema = rewardAdminSchemas[action];
    if (!schema)
      throw new ApiError(404, "NOT_FOUND", "This action was not found.");
    const key = idempotency(request),
      document = await jsonBody(request, schema, 8192),
      requestHash = tokenHash(JSON.stringify({ action, document }));
    let d = document;
    if (action === "credential") {
      if (
        document.kind === "wallet" &&
        !walletConfiguration(env) &&
        !googleWalletConfiguration(env)
      )
        throw new ApiError(
          503,
          "WALLET_UNAVAILABLE",
          "Wallet issuance is awaiting issuer configuration.",
        );
      const raw = token();
      d = {
        ...document,
        tokenHash: tokenHash(raw),
        encryptedToken: encryptPayload(
          { credential: raw },
          config.encryptionSecret,
        ),
      };
    }
    const result = checked(
      await db.rpc("reward_admin_mutate", {
        p_actor: session.user.id,
        p_session: session.sessionId,
        p_action: action,
        p_document: d,
        p_key_hash: tokenHash(key),
        p_request_hash: requestHash,
        p_request: requestId,
      }),
    );
    if (action === "credential") {
      const { credential } = decryptPayload(
        result.encryptedToken,
        config.encryptionSecret,
      );
      return reply({
        id: result.id,
        memberId: result.member_id,
        credential,
        url: cardUrl(config.origin, credential),
        emailQueued: true,
      });
    }
    return reply(result);
  }
  if (path === "/api/v1/rewards/leaderboard") {
    allowMethod(request, response, ["GET"]);
    await quota(store, request, response, config, "rewards.public", 120);
    const q = queryValues(
      url.searchParams,
      z
        .object({ page: z.coerce.number().int().min(1).max(10000).default(1) })
        .strict(),
    );
    return reply({
      ...checked(await db.rpc("reward_public_board", { p_page: q.page })),
      ssoAvailable: !!providerConfig(env),
    });
  }
  if (path === "/api/v1/rewards/login") {
    allowMethod(request, response, ["POST"]);
    await quota(store, request, response, config, "rewards.login", 10);
    await jsonBody(request, z.object({}).strict(), 100);
    const provider = providerConfig(env);
    if (!provider) throw notConnected();
    const raw = token(),
      verifier = token() + token(),
      origin = rewardsOrigin(request, config),
      startedAt = Date.now();
    checked(
      await db.from("reward_auth_flows").insert({
        token_hash: tokenHash(raw),
        origin,
        encrypted_verifier: encryptPayload(
          { verifier, startedAt },
          config.encryptionSecret,
        ),
      }),
    );
    appendCookie(
      response,
      authCookie(flowCookie(config), raw, {
        secure: config.secureCookies,
        maxAge: 300,
      }),
    );
    const challenge = Buffer.from(tokenHash(verifier), "hex").toString(
      "base64url",
    );
    const target = new URL("/auth/v1/authorize", provider.url);
    target.search = new URLSearchParams({
      provider: provider.provider,
      redirect_to: origin + "/api/v1/rewards/callback",
      code_challenge: challenge,
      code_challenge_method: "s256",
    }).toString();
    return reply({ url: target.href });
  }
  if (path === "/api/v1/rewards/callback") {
    allowMethod(request, response, ["GET"]);
    const provider = providerConfig(env);
    if (!provider) throw notConnected();
    const raw = readCookie(request.headers.cookie, flowCookie(config));
    appendCookie(
      response,
      authCookie(flowCookie(config), "", {
        secure: config.secureCookies,
        maxAge: 0,
      }),
    );
    const q = queryValues(
      url.searchParams,
      z.object({ code: z.string().min(8).max(1000) }).strict(),
    );
    if (!raw)
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Start campus sign-in again from this browser.",
      );
    const flow = checked(
      await db.rpc("reward_consume_flow", { p_hash: tokenHash(raw) }),
    );
    if (!flow || flow.origin !== rewardsOrigin(request, config))
      throw new ApiError(403, "FORBIDDEN", "This sign-in attempt has expired.");
    const { verifier, startedAt } = decryptPayload(
      flow.encryptedVerifier,
      config.encryptionSecret,
    );
    const exchange = await fetchImpl(
      provider.url + "/auth/v1/token?grant_type=pkce",
      {
        method: "POST",
        headers: { apikey: provider.key, "Content-Type": "application/json" },
        body: JSON.stringify({ auth_code: q.code, code_verifier: verifier }),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!exchange.ok)
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Campus sign-in could not be completed. Please start again.",
      );
    const auth = await exchange.json();
    if (typeof auth.access_token !== "string") throw notConnected();
    const verify = await fetchImpl(provider.url + "/auth/v1/user", {
      headers: {
        apikey: provider.key,
        Authorization: "Bearer " + auth.access_token,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!verify.ok)
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Your campus identity could not be verified.",
      );
    const identity = verifiedGtIdentity(
        await verify.json(),
        provider.provider,
        startedAt,
      ),
      session = token(),
      csrf = token();
    checked(
      await db.rpc("reward_open_session", {
        p_email: identity.email,
        p_subject: identity.subject,
        p_token: tokenHash(session),
        p_csrf: tokenHash(csrf),
      }),
    );
    appendCookie(
      response,
      authCookie(sessionCookie(config), session, {
        secure: config.secureCookies,
        maxAge: 43200,
      }),
    );
    appendCookie(
      response,
      authCookie(csrfCookie(config), csrf, {
        secure: config.secureCookies,
        maxAge: 43200,
      }),
    );
    response.statusCode = 303;
    response.setHeader(
      "Location",
      rewardsPagePaths(new URL(rewardsOrigin(request, config)).hostname)
        ?.member || "/member",
    );
    response.end();
    return true;
  }
  const raw = readCookie(request.headers.cookie, sessionCookie(config)),
    csrf = readCookie(request.headers.cookie, csrfCookie(config));
  if (!raw)
    throw new ApiError(
      401,
      "AUTH_REQUIRED",
      "Sign in with Georgia Tech to view your member account.",
    );
  const member = checked(
    await db.rpc("reward_member_read", { p_hash: tokenHash(raw) }),
  );
  if (!csrf || !equalHashes(member.csrfHash, tokenHash(csrf)))
    throw new ApiError(
      401,
      "AUTH_REQUIRED",
      "Sign in again to refresh your member session.",
    );
  await quota(store, request, response, config, "rewards.member", 120);
  const walletMatch = path.match(
    /^\/api\/v1\/rewards\/(wallet|google-wallet)\/([0-9a-f-]{36})$/,
  );
  if (walletMatch) {
    if (
      walletMatch[1] === "google-wallet" &&
      !googleWalletConfiguration(env)?.approved
    )
      throw new ApiError(
        503,
        "GOOGLE_WALLET_UNAVAILABLE",
        "Google Wallet is awaiting publishing approval.",
      );
    allowMethod(request, response, ["GET"]);
    return downloadMemberPass({
      provider: walletMatch[1] === "google-wallet" ? "google" : "apple",
      fetchImpl,
      id: uuid.parse(walletMatch[2]),
      memberId: member.id,
      db,
      config,
      request,
      response,
      env,
    });
  }
  if (path === "/api/v1/rewards/me") {
    allowMethod(request, response, ["GET"]);
    const safe = { ...member };
    delete safe.csrfHash;
    delete safe.sessionId;
    safe.walletCredentials = checked(
      await db
        .from("reward_credentials")
        .select("id,label")
        .eq("member_id", member.id)
        .eq("kind", "wallet")
        .is("revoked_at", null)
        .limit(5),
    );
    safe.walletAvailable = !!walletConfiguration(env);
    safe.googleWalletAvailable = !!googleWalletConfiguration(env)?.approved;
    return reply({ ...safe, csrf });
  }
  allowMethod(request, response, ["POST"]);
  if (request.headers["x-rewards-csrf"] !== csrf)
    throw new ApiError(
      403,
      "CSRF_INVALID",
      "Reload your member account and try again.",
    );
  if (path === "/api/v1/rewards/logout") {
    checked(
      await db
        .from("reward_member_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", member.sessionId),
    );
    for (const name of [sessionCookie(config), csrfCookie(config)])
      appendCookie(
        response,
        authCookie(name, "", { secure: config.secureCookies, maxAge: 0 }),
      );
    return reply({ signedOut: true });
  }
  const action = path.slice("/api/v1/rewards/".length),
    schema = rewardMemberSchemas[action];
  if (!schema)
    throw new ApiError(404, "NOT_FOUND", "This action was not found.");
  const document = await jsonBody(request, schema, 4096),
    key = idempotency(request);
  return reply(
    checked(
      await db.rpc("reward_member_mutate", {
        p_hash: tokenHash(raw),
        p_csrf: tokenHash(csrf),
        p_action: action,
        p_document: document,
        p_key_hash: tokenHash(key),
        p_request_hash: tokenHash(JSON.stringify({ action, document })),
      }),
    ),
  );
}
