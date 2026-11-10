import { rewardsRoutes, rewardsOrigin } from "./rewards.mjs";
import { rewardEventRoutes } from "./reward-events.mjs";
import { accountSecurityRoutes } from "./account-security.mjs";
import { createAuthHandler } from "./auth.mjs";
import { serverConfig } from "./config.mjs";
import { serverDatabase } from "./db/client.mjs";
import { SecurityStore } from "./db/security-store.mjs";
import { ApiError, apiBoundary, checkOrigin } from "./lib/http.mjs";
import { eventRoutes } from "./events.mjs";
import { publicContentRoutes } from "./public-content.mjs";
import { accessRoutes } from "./access.mjs";
import { publicSubmissionRoutes } from "./public-submissions.mjs";
import { workspaceRoutes } from "./workspace.mjs";
import { formRoutes } from "./forms.mjs";
import { formResponseRoutes } from "./form-responses.mjs";
import { formExportRoutes } from "./form-exports.mjs";
import { formHistoryRoutes } from "./form-history.mjs";
import { formDeliveryRoutes } from "./form-delivery.mjs";
import { formPrivacyRoutes } from "./form-privacy.mjs";
import { formIntegrationRoutes } from "./form-integrations.mjs";
import { formDeletionRoutes } from "./form-deletion.mjs";
import { formCollaboratorRoutes } from "./form-collaborators.mjs";
import { formLinkRoutes } from "./form-links.mjs";
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
import { teamChatRoutes } from "./team-chat.mjs";
import { financeRoutes } from "./finances.mjs";
import { financeUploadRoutes } from "./finance-uploads.mjs";
import { linktreeRoutes } from "./linktree.mjs";
import { projectRoutes } from "./projects.mjs";
import { siteStatusRoutes } from "./site-status.mjs";
import { memberRoutes } from "./members.mjs";
import { memberTransferRoutes } from "./member-transfer.mjs";
import { blogRoutes } from "./blog.mjs";
import { blogUploadRoutes } from "./blog-uploads.mjs";
import { mediaRoutes } from "./media.mjs";
import { mediaUploadRoutes } from "./media-uploads.mjs";
import { mediaPublicationRoutes } from "./media-publication.mjs";
import { newsletterMemberImportRoutes } from "./newsletter-member-import.mjs";
import { newsletterRoutes } from "./newsletter.mjs";
import { newsletterSendRoutes } from "./newsletter-sends.mjs";
import { newsletterWebhookRoutes } from "./newsletter-webhook.mjs";
import { newsletterResultRoutes } from "./newsletter-results.mjs";
import { contactUploadRoutes } from "./contact-uploads.mjs";
import { contactInboxRoutes } from "./contact-inbox.mjs";
import { appNotificationRoutes } from "./app-notifications.mjs";
import { pushRoutes } from "./push.mjs";
import { personPrivacyRoutes } from "./person-privacy.mjs";
import { createTelemetryLogger } from "./lib/telemetry.mjs";
import { operationsRoutes } from "./operations.mjs";
import { seoRoutes } from "./seo.mjs";

export function applicationHandler({
  store,
  config,
  db,
  log,
  webhookEnv,
} = {}) {
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
        if (
          await newsletterWebhookRoutes(request, response, {
            db,
            store,
            config,
            requestId,
            ...(webhookEnv ? { env: webhookEnv } : {}),
          })
        )
          return;
        if (
          await operationsRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (pathname === "/api/v1/rewards/callback") {
          if (
            await rewardsRoutes(request, response, {
              db,
              store,
              config,
              requestId,
            })
          )
            return;
        }
        if (pathname.startsWith("/api/v1/integrations/membership/")) {
          if (
            await rewardEventRoutes(request, response, {
              db,
              store,
              config,
              requestId,
            })
          )
            return;
        }
        checkOrigin(
          request,
          pathname.startsWith("/api/v1/rewards/")
            ? rewardsOrigin(request, config)
            : config.origin,
          {
            mutation: !["GET", "HEAD"].includes(request.method),
          },
        );
        if (
          await rewardEventRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await rewardsRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (await seoRoutes(request, response, { db, config, requestId }))
          return;
        if (
          await personPrivacyRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (await appNotificationRoutes(request, response, { db, store, config, requestId })) return;
        if (
          await pushRoutes(request, response, { db, store, config, requestId })
        )
          return;
        if (
          await contactUploadRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await contactInboxRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await newsletterResultRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await newsletterSendRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (await newsletterMemberImportRoutes(request,response,{db,store,config,requestId})) return;
        if (
          await newsletterRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await mediaPublicationRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await mediaUploadRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          (await blogUploadRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })) ||
          (await blogRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })) ||
          (await memberTransferRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })) ||
          (await memberRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })) ||
          (await siteStatusRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })) ||
          (await projectRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })) ||
          (await linktreeRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          }))
        )
          return;
        if (
          (await financeUploadRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })) ||
          (await financeRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          }))
        )
          return;
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
          await teamChatRoutes(request, response, {
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
          await mediaRoutes(request, response, { db, store, config, requestId })
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
          await formDeletionRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await formIntegrationRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await formPrivacyRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await formDeliveryRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await formHistoryRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await formExportRoutes(request, response, {
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
          await formCollaboratorRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
        if (
          await formLinkRoutes(request, response, {
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
        if (
          await accountSecurityRoutes(request, response, {
            db,
            store,
            config,
            requestId,
          })
        )
          return;
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
        log: createTelemetryLogger({ db }),
      });
    }
  } catch (error) {
    return apiBoundary(
      request,
      response,
      async () => {
        throw error;
      },
      { log: createTelemetryLogger() },
    );
  }
  return configured(request, response);
}
