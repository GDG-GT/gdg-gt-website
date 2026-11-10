import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import { databaseResult as checked, queryValues, uuid } from "./lib/validation.mjs";
import { encryptPayload } from "./lib/encryption.mjs";
import { tokenHash, riskHash } from "./lib/security.mjs";
import { validatePushSubscription } from "./lib/push-transport.mjs";
import { appPushConfig } from "./lib/app-push-transport.mjs";
import { appDeviceRegistration, notificationPreferences } from "../shared/app-notifications.mjs";
export async function appNotificationRoutes(request, response, { db, store, config, requestId, env = process.env }) {
  const url = new URL(request.url, config.origin), match = url.pathname.match(/^\/api\/v1\/admin\/app-notifications(?:\/(preferences|devices)(?:\/([0-9a-f-]{36}))?)?$/);
  if (!match) return false;
  const action = match[1], device = match[2];
  allowMethod(request, response, !action ? ["GET"] : action === "preferences" ? ["PATCH"] : device ? ["DELETE"] : ["POST"]);
  queryValues(url.searchParams, z.object({}).strict());
  const session = await requireSession(request, store, config), args = { p_actor: session.user.id, p_session: session.sessionId }, settings = appPushConfig(env);
  if (!settings.enabled) throw new ApiError(503, "NOTIFICATIONS_UNAVAILABLE", "App notifications are not available yet.");
  const limit = await store.rateLimit("app-notifications", riskHash(session.user.id, config.riskSecret), 100, 900);
  if (!limit.allowed) throw new ApiError(429, "RATE_LIMITED", "Wait before changing notification settings again.");
  if (!action) {
    const saved = checked(await db.rpc("read_app_notification_settings", args));
    sendJson(response, 200, { ...saved, config: settings.public }, requestId); return true;
  }
  await requireCsrf(request, session, store);
  if (action === "preferences") {
    const preferences = await jsonBody(request, notificationPreferences, 2048);
    checked(await db.rpc("save_app_notification_preferences", { ...args, p_categories: preferences }));
    sendJson(response, 200, { saved: true }, requestId); return true;
  }
  if (device) {
    checked(await db.rpc("remove_app_notification_device", { ...args, p_device: uuid.parse(device) }));
    sendJson(response, 200, { removed: true }, requestId); return true;
  }
  const body = await jsonBody(request, appDeviceRegistration, 15000);
  if (!settings.platforms.includes(body.platform)) throw new ApiError(503, "PUSH_NOT_CONFIGURED", "Notifications for this device are not ready yet.");
  const address = body.platform === "web" ? validatePushSubscription(body.subscription) : { token: body.token },
    hash = tokenHash(body.platform === "web" ? address.endpoint : address.token);
  const id = checked(await db.rpc("register_app_notification_device", { ...args, p_installation: body.installationId, p_platform: body.platform, p_environment: body.environment,
    p_hash: hash, p_encrypted: encryptPayload(address, config.encryptionSecret), p_label: body.label }));
  sendJson(response, 200, { id, registered: true }, requestId); return true;
}
export async function queueMailAppNotification(db, job, message, category, env = process.env) {
  if (env.APP_NOTIFICATIONS_ENABLED !== "true" || !message?.to) return;
  checked(await db.rpc("queue_mail_app_notification", { p_job: job.id, p_lease: job.lease_token, p_email: message.to, p_category: category, p_subject: message.subject.slice(0, 255), p_chapter: !!env.CHAPTER_CONTACT_EMAIL && message.to.toLowerCase() === env.CHAPTER_CONTACT_EMAIL.toLowerCase() }));
}
