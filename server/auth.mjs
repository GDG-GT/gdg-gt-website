import { z } from "zod";
import {
  ApiError,
  apiBoundary,
  checkOrigin,
  allowMethod,
  jsonBody,
  sendJson,
} from "./lib/http.mjs";
import {
  token,
  tokenHash,
  riskHash,
  validToken,
  equalHashes,
  verifySecret,
  hashSecret,
  readCookie,
  authCookie,
  appendCookie,
} from "./lib/security.mjs";

const gateSchema = z.object({ code: z.string().min(1).max(256) }).strict();
const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(255),
    password: z.string().min(1).max(128),
  })
  .strict();
const passwordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(14).max(128),
  })
  .strict();
const failure = () =>
  new ApiError(
    401,
    "AUTH_REQUIRED",
    "We couldn’t sign you in. Please try again.",
  );
function clearCookies(response, config) {
  appendCookie(
    response,
    authCookie(config.gateCookie, "", {
      maxAge: 0,
      strict: true,
      secure: config.secureCookies,
    }),
  );
  appendCookie(
    response,
    authCookie(config.sessionCookie, "", {
      maxAge: 0,
      secure: config.secureCookies,
    }),
  );
}
export async function requireSession(request, store, config) {
  const raw = readCookie(request.headers.cookie, config.sessionCookie);
  const session = raw && (await store.validateSession(tokenHash(raw)));
  if (!session?.user?.is_active)
    throw new ApiError(
      401,
      "AUTH_REQUIRED",
      "Your session has ended. Please sign in again.",
    );
  return session;
}
export async function requireCsrf(request, session, store) {
  const raw = request.headers["x-csrf-token"];
  const record = validToken(raw) ? await store.csrf(session.sessionId) : null;
  if (
    !record ||
    new Date(record.expires_at).getTime() <= Date.now() ||
    !equalHashes(tokenHash(raw), record.token_hash)
  ) {
    throw new ApiError(
      403,
      "CSRF_INVALID",
      "Your session needs refreshing. Please reload and try again.",
    );
  }
}

export function createAuthHandler({
  store,
  config,
  verify = verifySecret,
  log,
}) {
  return (request, response) =>
    apiBoundary(
      request,
      response,
      async (requestId) => {
        const pathname = new URL(request.url, config.origin).pathname;
        const mutation = !["GET", "HEAD"].includes(request.method);
        checkOrigin(request, config.origin, { mutation });
        const risk = riskHash(
          request.socket?.remoteAddress || "unknown",
          config.riskSecret,
        );
        const rate = async (scope, key, limit, seconds) => {
          const result = await store.rateLimit(scope, key, limit, seconds);
          if (!result.allowed) {
            response.setHeader("Retry-After", String(result.retryAfter));
            throw new ApiError(
              429,
              "RATE_LIMITED",
              "Please wait before trying again.",
            );
          }
        };
        if (pathname === "/api/v1/auth/gate") {
          allowMethod(request, response, ["GET", "POST"]);
          const settings = await store.gateConfiguration(
            config.initialGateHash,
          );
          if (request.method === "GET") {
            const raw = readCookie(request.headers.cookie, config.gateCookie);
            return sendJson(
              response,
              200,
              {
                gateValid:
                  !!raw &&
                  (await store.validGate(
                    tokenHash(raw),
                    settings.gate_version,
                  )),
              },
              requestId,
            );
          }
          await rate("auth.gate.requests", risk, 60, 900);
          const gateLimit = await store.checkRateLimit(
            "auth.gate.failures",
            risk,
            5,
          );
          if (!gateLimit.allowed) {
            response.setHeader("Retry-After", String(gateLimit.retryAfter));
            await store.audit({
              action: "auth.gate_locked",
              requestId,
              result: "denied",
            });
            throw new ApiError(
              429,
              "RATE_LIMITED",
              "Please wait before trying again.",
            );
          }
          const { code } = await jsonBody(request, gateSchema, 4096);
          if (!(await verify(code, settings.gate_hash))) {
            await rate("auth.gate.failures", risk, 5, 900);
            await store.audit({
              action: "auth.gate_failed",
              requestId,
              result: "denied",
            });
            throw failure();
          }
          const raw = token();
          await store.createGate(tokenHash(raw), settings.gate_version);
          appendCookie(
            response,
            authCookie(config.gateCookie, raw, {
              maxAge: 900,
              strict: true,
              secure: config.secureCookies,
            }),
          );
          return sendJson(response, 200, { gateValid: true }, requestId);
        }
        if (pathname === "/api/v1/auth/login") {
          allowMethod(request, response, ["POST"]);
          const rawGate = readCookie(request.headers.cookie, config.gateCookie);
          const settings = await store.gateConfiguration(
            config.initialGateHash,
          );
          if (
            !rawGate ||
            !(await store.validGate(tokenHash(rawGate), settings.gate_version))
          )
            throw new ApiError(
              403,
              "GATE_REQUIRED",
              "Please open the chapter access entry first.",
            );
          await rate("auth.login.ip", risk, 20, 900);
          const body = await jsonBody(request, loginSchema, 4096);
          await rate(
            "auth.login.account",
            riskHash(body.email, config.riskSecret),
            5,
            900,
          );
          const account = await store.accountByEmail(body.email);
          const matches = await verify(body.password, account?.password_hash);
          if (
            !matches ||
            !account?.is_active ||
            account.deleted_at ||
            account.must_change_password ||
            (account.temporary_password_expires_at &&
              new Date(account.temporary_password_expires_at).getTime() <=
                Date.now()) ||
            (account.locked_until &&
              new Date(account.locked_until).getTime() > Date.now())
          ) {
            await store.recordLoginFailure(account);
            await store.audit({
              action: "auth.login_failed",
              requestId,
              result: "denied",
            });
            throw failure();
          }
          const raw = token(),
            csrf = token();
          await store.createSession({
            adminId: account.id,
            tokenHash: tokenHash(raw),
            csrfHash: tokenHash(csrf),
            gateHash: tokenHash(rawGate),
            passwordHash: account.password_hash,
            requestId,
          });
          appendCookie(
            response,
            authCookie(config.sessionCookie, raw, {
              maxAge: 7 * 24 * 60 * 60,
              secure: config.secureCookies,
            }),
          );
          return sendJson(
            response,
            200,
            {
              user: {
                id: account.id,
                email: account.email,
                role: account.role,
                display_name: account.display_name,
                is_active: true,
                created_at: account.created_at,
              },
              csrfToken: csrf,
            },
            requestId,
          );
        }
        if (pathname === "/api/v1/auth/password") {
          allowMethod(request, response, ["POST"]);
          const session = await requireSession(request, store, config);
          await requireCsrf(request, session, store);
          await rate(
            "auth.password",
            riskHash(session.user.id, config.riskSecret),
            5,
            900,
          );
          const body = await jsonBody(request, passwordSchema, 4096);
          const account = await store.accountByEmail(session.user.email);
          if (!(await verify(body.currentPassword, account?.password_hash)))
            throw failure();
          if (body.currentPassword === body.newPassword)
            throw new ApiError(
              400,
              "VALIDATION_ERROR",
              "Choose a different new password.",
              { newPassword: "Choose a different password." },
            );
          const raw = token(),
            csrf = token();
          await store.changePassword({
            adminId: session.user.id,
            sessionId: session.sessionId,
            verifiedHash: account.password_hash,
            newHash: await hashSecret(body.newPassword),
            tokenHash: tokenHash(raw),
            csrfHash: tokenHash(csrf),
            requestId,
          });
          appendCookie(
            response,
            authCookie(config.sessionCookie, raw, {
              maxAge: 7 * 24 * 60 * 60,
              secure: config.secureCookies,
            }),
          );
          return sendJson(
            response,
            200,
            { changed: true, csrfToken: csrf },
            requestId,
          );
        }
        if (pathname === "/api/v1/auth/session") {
          allowMethod(request, response, ["GET", "DELETE"]);
          const session = await requireSession(request, store, config);
          if (request.method === "DELETE") {
            await requireCsrf(request, session, store);
            await store.revokeSession(session.sessionId);
            await store.audit({
              actorId: session.user.id,
              action: "auth.logout",
              targetType: "admin_session",
              targetId: session.sessionId,
              requestId,
            });
            clearCookies(response, config);
            return sendJson(response, 200, { signedOut: true }, requestId);
          }
          let csrf = request.headers["x-csrf-token"];
          try {
            await requireCsrf(request, session, store);
          } catch (error) {
            if (!(error instanceof ApiError) || error.code !== "CSRF_INVALID")
              throw error;
            csrf = token();
            await store.rotateCsrf(session.sessionId, tokenHash(csrf));
          }
          return sendJson(
            response,
            200,
            {
              user: session.user,
              memberships: await store.memberships(session.user.id),
              permissionVersion: session.user.permission_version,
              csrfToken: csrf,
            },
            requestId,
          );
        }
        if (pathname === "/api/v1/auth/sessions") {
          allowMethod(request, response, ["DELETE"]);
          const session = await requireSession(request, store, config);
          await requireCsrf(request, session, store);
          await store.revokeOtherSessions(session.user.id, session.sessionId);
          await store.audit({
            actorId: session.user.id,
            action: "auth.other_sessions_revoked",
            requestId,
          });
          return sendJson(response, 200, { revoked: true }, requestId);
        }
        throw new ApiError(404, "NOT_FOUND", "This endpoint was not found.");
      },
      { log },
    );
}
