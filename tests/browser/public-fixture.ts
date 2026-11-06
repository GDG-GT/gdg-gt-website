import { test as base, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { teamGrantOptions } from "../../shared/teams";
const require = createRequire(import.meta.url);
export type PublicFixture = {
  authenticated: boolean;
  failEvents: boolean;
  failedHome: boolean;
  writes: string[];
  unexpected: string[];
  accountReview: boolean;
  failAccountSave: boolean;
  accountWrites: { key: string; fingerprint: string }[];
  accountCommitted: number;
  teamReview: boolean;
  failTeamSave: boolean;
  teamWrites: { key: string; fingerprint: string }[];
  teamCommitted: number;
  failedTeamPanel: "" | "invitations" | "announcements";
  deniedTeamPanel: "" | "invitations" | "announcements";
};
export const fictionalTeamInvite = {
  id: "fbbb0000-0000-4000-8000-000000000004",
  email: "fictional-team-recipient@example.test",
  role: "member",
  status: "pending",
  revision: 1,
  invited_by: "fbbb0000-0000-4000-8000-000000000001",
  expires_at: "2026-11-12T12:00:00Z",
  last_sent_at: "2026-11-05T12:00:00Z",
};
export const fictionalTeamPost = {
  id: "fbbb0000-0000-4000-8000-000000000005",
  title: "Fictional private team announcement",
  message: "Fictional private announcement body",
  priority: "normal",
  is_pinned: false,
  is_published: false,
  scheduled_for: null,
  expires_at: null,
  revision: 1,
  deleted_at: null,
  created_at: "2026-11-05T12:00:00Z",
  authorName: "Fictional browser reviewer",
  isRead: false,
  readCount: 0,
};
export const fictionalTeam = {
  id: "fbbb0000-0000-4000-8000-000000000003",
  name: "Fictional browser team",
  slug: "fictional-browser-team",
  description: "Fictional team for local browser checks",
  color: "#4285F4",
  icon: "users",
  revision: 1,
  is_active: true,
  deleted_at: null,
};
export const fictionalManagedAccount = {
  id: "fbbb0000-0000-4000-8000-000000000002",
  email: "fictional-managed@example.test",
  display_name: "Fictional managed account",
  role: "team_member",
  is_active: true,
  must_change_password: false,
  revision: 1,
  deleted_at: null,
  last_login_at: null,
  locked_until: null,
};
const empty = { items: [], total: 0, page: 1, pageSize: 30 };
const fictionalUser = {
  id: "fbbb0000-0000-4000-8000-000000000001",
  display_name: "Fictional browser reviewer",
  email: "fictional-browser@example.test",
  role: "super_admin",
  is_active: true,
  must_change_password: false,
  revision: 1,
  created_at: "2026-11-04T12:00:00Z",
};
export const test = base.extend<{ fixture: PublicFixture }>({
  fixture: [
    async ({ page, baseURL }, use) => {
      const state: PublicFixture = {
        authenticated: false,
        failEvents: false,
        failedHome: false,
        writes: [],
        unexpected: [],
        accountReview: false,
        failAccountSave: false,
        accountWrites: [],
        accountCommitted: 0,
        teamReview: false,
        failTeamSave: false,
        teamWrites: [],
        teamCommitted: 0,
        failedTeamPanel: "",
        deniedTeamPanel: "",
      };
      let team = { ...fictionalTeam };
      const teamWorkspace = () => ({
        team,
        members: [],
        actions: { settings: true, manage: true, permissions: true },
        actorRole: "super_admin",
        pages: teamGrantOptions.map((option) => ({
          page_path: option.path,
          can_access: true,
        })),
        permissions: teamGrantOptions.flatMap((option) =>
          ["crud", ...option.extras].map((permission) => ({
            resource_type: option.resource,
            permission,
            can_create: true,
            can_read: true,
            can_update: true,
            can_delete: true,
          })),
        ),
        statistics: { activeMembers: 0, activeLeads: 0, membershipChanges: 0 },
      });
      const teamReceipts = new Map<string, string>();
      let managedAccount = { ...fictionalManagedAccount };
      const accountReceipts = new Map<
        string,
        { fingerprint: string; record: typeof managedAccount }
      >();
      await page.clock.setFixedTime(new Date("2026-11-05T12:00:00Z"));
      await page.route("**/*", async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        if (url.origin !== new URL(baseURL!).origin) {
          state.unexpected.push("External request: " + url.origin);
          await route.abort("blockedbyclient");
          return;
        }
        if (!url.pathname.startsWith("/api/v1/")) {
          await route.continue();
          return;
        }
        const path = url.pathname.slice("/api/v1".length);
        const reply = async (status: number, data: unknown) =>
          route.fulfill({
            status,
            headers: {
              "Cache-Control": "no-store",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(
              status === 200
                ? { data, meta: { requestId: "fictional-browser-check" } }
                : {
                    error: {
                      code:
                        status === 401
                          ? "UNAUTHENTICATED"
                          : "TEMPORARILY_UNAVAILABLE",
                      message: "Fictional browser fixture request unavailable.",
                    },
                  },
            ),
          });
        if (
          state.authenticated &&
          ["/auth/realtime-token", "/realtime/token"].includes(path)
        ) {
          await reply(503, null);
          return;
        }
        if (
          state.authenticated &&
          state.teamReview &&
          request.method() === "PATCH" &&
          path === "/admin/teams/" + fictionalTeam.id
        ) {
          const body = request.postDataJSON(),
            key = request.headers()["idempotency-key"];
          if (!key || body.currentPassword !== "Fictional browser password") {
            state.writes.push("Invalid fictional team mutation");
            await reply(403, null);
            return;
          }
          const { currentPassword: _proof, ...intent } = body;
          const fingerprint = JSON.stringify(intent),
            receipt = teamReceipts.get(key);
          state.teamWrites.push({ key, fingerprint });
          if (
            (receipt && receipt !== fingerprint) ||
            (!receipt && body.revision !== team.revision)
          ) {
            await reply(409, null);
            return;
          }
          if (!receipt) {
            team = { ...team, ...body.record, revision: team.revision + 1 };
            teamReceipts.set(key, fingerprint);
            state.teamCommitted++;
          }
          if (state.failTeamSave) {
            state.failTeamSave = false;
            await route.abort("connectionfailed");
            return;
          }
          await reply(200, teamWorkspace());
          return;
        }
        if (
          state.authenticated &&
          state.accountReview &&
          request.method() === "PATCH" &&
          path === "/admin/users/" + fictionalManagedAccount.id
        ) {
          const body = request.postDataJSON(),
            key = request.headers()["idempotency-key"];
          if (!key || body.currentPassword !== "Fictional browser password") {
            state.writes.push("Invalid fictional account mutation");
            await reply(403, null);
            return;
          }
          const { currentPassword: _proof, ...intent } = body;
          const fingerprint = JSON.stringify(intent),
            receipt = accountReceipts.get(key);
          state.accountWrites.push({ key, fingerprint });
          if (
            (receipt && receipt.fingerprint !== fingerprint) ||
            (!receipt && body.revision !== managedAccount.revision)
          ) {
            await reply(409, null);
            return;
          }
          if (!receipt) {
            managedAccount = {
              ...managedAccount,
              ...body.record,
              revision: managedAccount.revision + 1,
            };
            accountReceipts.set(key, {
              fingerprint,
              record: { ...managedAccount },
            });
            state.accountCommitted++;
          }
          if (state.failAccountSave) {
            state.failAccountSave = false;
            await route.abort("connectionfailed");
            return;
          }
          await reply(200, {
            record: accountReceipts.get(key)!.record,
            accessQueued: false,
          });
          return;
        }
        if (request.method() !== "GET") {
          state.writes.push(request.method() + " " + path);
          await reply(403, null);
          return;
        }
        if (path === "/auth/session") {
          await reply(
            state.authenticated ? 200 : 401,
            state.authenticated
              ? {
                  user: fictionalUser,
                  csrfToken: "fictional-browser-csrf",
                  sessionBinding: "a".repeat(64),
                }
              : null,
          );
          return;
        }
        if (state.authenticated && path.startsWith("/admin/")) {
          if (path === "/admin/me") {
            await reply(200, {
              user: fictionalUser,
              memberships: [],
              profile: null,
            });
            return;
          }
          if (path === "/admin/access") {
            await reply(200, {
              allowed: true,
              accessibleRoutes: [
                "/admin",
                "/admin/profile",
                "/admin/forms",
                "/admin/guide",
                "/admin/events",
                "/admin/audit-log",
                "/admin/users",
                "/admin/teams",
                ...(state.teamReview
                  ? ["/admin/team/" + fictionalTeam.id]
                  : []),
              ],
            });
            return;
          }
          if (path === "/admin/me/sessions") {
            await reply(200, {
              items: [
                {
                  id: "fictional-current-session",
                  current: true,
                  created_at: "2026-11-04T12:00:00Z",
                  last_seen_at: "2026-11-05T11:00:00Z",
                  absolute_expires_at: "2026-11-12T12:00:00Z",
                },
              ],
            });
            return;
          }
          if (path === "/admin/me/activity") {
            await reply(200, { items: [] });
            return;
          }
          if (path === "/admin/notifications") {
            await reply(200, { ...empty, unreadCount: 0 });
            return;
          }
          if (path === "/admin/forms" || path === "/admin/forms/filters") {
            await reply(200, { ...empty, canCreate: true });
            return;
          }
          if (path === "/admin/events") {
            await reply(200, {
              ...empty,
              capabilities: { globalCreate: true, teams: [] },
            });
            return;
          }
          if (path === "/admin/dashboard") {
            const ready = (data: unknown) => ({ state: "ready", data });
            await reply(200, {
              generatedAt: "2026-11-05T12:00:00Z",
              allowedRoutes: ["/admin/events", "/admin/forms"],
              widgets: {
                events: ready({ count: 0, items: [] }),
                profiles: ready({ count: 0 }),
                finances: ready({ pending: 0 }),
                messages: ready({ unread: 0 }),
                registrations: ready({ totalEvents: 0, items: [] }),
                funding: ready({ items: [] }),
                activity: ready({ items: [] }),
                tasks: ready({ items: [] }),
                memberships: ready({ items: [] }),
              },
            });
            return;
          }
          if (path === "/admin/users") {
            await reply(200, {
              ...empty,
              ...(state.accountReview
                ? { items: [managedAccount], total: 1 }
                : {}),
              actorId: fictionalUser.id,
            });
            return;
          }
          if (path === "/admin/teams") {
            await reply(200, {
              ...empty,
              canCreate: true,
              ...(state.teamReview ? { items: [team], total: 1 } : {}),
            });
            return;
          }
          if (state.teamReview && path === "/admin/teams/" + fictionalTeam.id) {
            await reply(200, teamWorkspace());
            return;
          }
          for (const panel of ["invitations", "announcements"] as const) {
            if (
              state.teamReview &&
              path === "/admin/teams/" + fictionalTeam.id + "/" + panel
            ) {
              if (
                state.deniedTeamPanel === panel ||
                state.failedTeamPanel === panel
              ) {
                await reply(state.deniedTeamPanel === panel ? 403 : 503, null);
                return;
              }
              await reply(200, {
                ...empty,
                items: [
                  panel === "invitations"
                    ? fictionalTeamInvite
                    : fictionalTeamPost,
                ],
                total: 1,
                canManage: true,
                actorId: fictionalUser.id,
                canInviteOfficers: true,
              });
              return;
            }
          }
          if (
            state.accountReview &&
            path === "/admin/users/" + fictionalManagedAccount.id
          ) {
            await reply(200, { record: managedAccount });
            return;
          }
          if (path === "/admin/audit") {
            await reply(200, {
              ...empty,
              at: "2026-11-05T12:00:00Z",
              nextCursor: null,
              statistics: {
                total: 0,
                success: 0,
                denied: 0,
                failure: 0,
                firstEntry: null,
                lastEntry: null,
                actions: [],
                retention: {
                  minimumYears: 2,
                  automaticPurge: false,
                  earliestAvailable: null,
                },
              },
            });
            return;
          }
        }
        if (path === "/site-status") {
          await reply(200, {
            revision: 1,
            is_live: true,
            message: "",
            redirect_url: "",
            button_text: "Chapter updates",
            auto_redirect: false,
          });
          return;
        }
        if (path === "/public/home") {
          if (state.failedHome) {
            await reply(503, null);
            return;
          }
          await reply(200, {
            settings: [],
            pages: [],
            navigation: [],
            social: [],
            footer: [],
            sponsors: [],
            metrics: [],
          });
          return;
        }
        if (
          [
            "/events",
            "/team",
            "/resources",
            "/sponsors",
            "/sponsor-tiers",
            "/sponsor-stats",
            "/gallery",
          ].includes(path)
        ) {
          if (path === "/events" && state.failEvents) {
            await reply(503, null);
            return;
          }
          await reply(200, {
            ...empty,
            page: Number(url.searchParams.get("page") || 1),
            pageSize: Number(url.searchParams.get("pageSize") || 30),
            ...(path === "/gallery" ? { events: [] } : {}),
          });
          return;
        }
        state.unexpected.push(request.method() + " " + path);
        await reply(503, null);
      });
      await use(state);
      expect(
        state.unexpected,
        "Every browser request must be local and explicitly covered by this fixture",
      ).toEqual([]);
      expect(
        state.writes,
        "Public browser smoke checks must not queue a send or change any data",
      ).toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
export async function accessibility(page: Page) {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  return page.evaluate(async () => {
    const engine = (
      window as unknown as {
        axe: {
          run: (
            root: Document,
            options: unknown,
          ) => Promise<{
            violations: {
              id: string;
              impact: string;
              nodes: { target: string[]; failureSummary: string }[];
            }[];
          }>;
        };
      }
    ).axe;
    const result = await engine.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
      },
    });
    return result.violations.map((item) => ({
      id: item.id,
      impact: item.impact,
      nodes: item.nodes.map((node) => ({
        target: node.target,
        summary: node.failureSummary,
      })),
    }));
  });
}
