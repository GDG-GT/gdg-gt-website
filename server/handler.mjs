import { createAuthHandler, requireSession, requireCsrf } from "./auth.mjs";
import { serverConfig } from "./config.mjs";
import { serverDatabase } from "./db/client.mjs";
import { SecurityStore } from "./db/security-store.mjs";
import {
  ApiError,
  apiBoundary,
  allowMethod,
  checkOrigin,
  jsonBody,
  sendJson,
} from "./lib/http.mjs";
import { hashSecret } from "./lib/security.mjs";
import { z } from "zod";
import { eventRoutes } from "./events.mjs";
import { publicContentRoutes } from "./public-content.mjs";
import { accessRoutes } from "./access.mjs";
import { publicSubmissionRoutes } from "./public-submissions.mjs";
import { workspaceRoutes } from "./workspace.mjs";
import { formRoutes } from "./forms.mjs";
import { formResponseRoutes } from "./form-responses.mjs";
import { formAccessRoutes } from "./form-access.mjs";
import { uploadRoutes } from "./uploads.mjs";
import { jobRoutes } from "./jobs.mjs";
import { contentRecordRoutes } from "./content-records.mjs";
import { siteContentRoutes } from "./site-content.mjs";
import { userRoutes } from "./users.mjs";
import { teamRoutes } from "./teams.mjs";
import { teamInvitationRoutes } from "./team-invitations.mjs";
import { teamAnnouncementRoutes } from "./team-announcements.mjs";
import { channelRoutes } from "./channels.mjs";
import { realtimeRoutes } from "./realtime.mjs";
import { whiteboardRoutes } from "./whiteboards.mjs";
import { taskRoutes } from "./tasks.mjs";
import { directMessageRoutes } from "./direct-messages.mjs";
import { chapterAnnouncementRoutes } from "./chapter-announcements.mjs";

export function applicationHandler({ store, config, db, log } = {}) {
  const auth = createAuthHandler({ store, config, log });
  return async (request, response) => {
    const pathname = new URL(request.url, config.origin).pathname;
    if (
      pathname.startsWith("/api/v1/auth/") &&
      pathname !== "/api/v1/auth/realtime-token"
    )
      return auth(request, response);
    return apiBoundary(
      request,
      response,
      async (requestId) => {
        if (
          await jobRoutes(request, response, { db, store, config, requestId })
        )
          return;
        checkOrigin(request, config.origin, {
          mutation: !["GET", "HEAD"].includes(request.method),
        });
        if (
          await userRoutes(request, response, { db, store, config, requestId })
        )
          return;
        if (
          await realtimeRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await channelRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await chapterAnnouncementRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await taskRoutes(request, response, { db, store, config, requestId })
        )
          return;
        if (
          await directMessageRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await whiteboardRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await teamAnnouncementRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await teamInvitationRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await teamRoutes(request, response, { db, store, config, requestId })
        )
          return;
        if (
          await eventRoutes(request, response, { db, store, config, requestId })
        )
          return;
        if (
          await publicContentRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await accessRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await publicSubmissionRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await workspaceRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await formResponseRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await formAccessRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await uploadRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await siteContentRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await contentRecordRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await formRoutes(request, response, { db, store, config, requestId })
        )
          return;
        if (pathname === "/api/v1/admin/security/gate") {
          allowMethod(request, response, ["POST"]);
          const session = await requireSession(request, store, config);
          await requireCsrf(request, session, store);
          if (session.user.role !== "super_admin")
            throw new ApiError(403, "FORBIDDEN", "This action is not allowed.");
          const { code } = await jsonBody(
            request,
            z.object({ code: z.string().min(24).max(128) }).strict(),
            4096,
          );
          await store.rotateGate(
            session.user.id,
            await hashSecret(code),
            requestId,
          );
          return sendJson(response, 200, { rotated: true }, requestId);
        }
        throw new ApiError(404, "NOT_FOUND", "This endpoint was not found.");
      },
      { log },
    );
  };
}
let configured;
export default async function handler(request, response) {
  try {
    if (!configured) {
      const db = serverDatabase();
      configured = applicationHandler({
        config: serverConfig(),
        db,
        store: new SecurityStore(db),
        log: (record) => console.info(JSON.stringify(record)),
      });
    }
  } catch (error) {
    return apiBoundary(request, response, async () => {
      throw error;
    });
  }
  return configured(request, response);
}
