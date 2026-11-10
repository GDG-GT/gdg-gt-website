import { z } from "zod";
import { browserPushSubscription } from "./push.mjs";
export const notificationCategories = ["forms", "events", "newsletter", "accounts", "id", "contact", "workspace"];
export const notificationPreferences = z.object(Object.fromEntries(notificationCategories.map(key => [key, z.boolean()]))).strict();
export const appDeviceRegistration = z.discriminatedUnion("platform", [
  z.object({ platform: z.literal("ios"), installationId: z.string().uuid(), environment: z.enum(["sandbox", "production"]), token: z.string().regex(/^[a-f0-9]{64,200}$/), label: z.string().trim().min(1).max(80) }).strict(),
  z.object({ platform: z.literal("web"), installationId: z.string().uuid(), environment: z.literal("production"), subscription: browserPushSubscription, label: z.string().trim().min(1).max(80) }).strict(),
]);
export function appNotificationPayload(notice) {
  const titles = { forms: "Form update", events: "Event update", newsletter: "Chapter news", accounts: "Account update", id: "Membership card update", contact: "Chapter inquiry update", workspace: "Workspace update" };
  return { type: "workspace-update", notificationId: notice.notificationId, title: titles[notice.category] || titles.workspace, body: "Open GDG Workspace to view your update.", path: "/admin/notifications", badge: Math.min(9999, Math.max(0, Number(notice.badge) || 0)) };
}
