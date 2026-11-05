import { test as base, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
export type PublicFixture = {
  authenticated: boolean;
  failEvents: boolean;
  failedHome: boolean;
  writes: string[];
  unexpected: string[];
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
      };
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
                "/admin/profile",
                "/admin/forms",
                "/admin/guide",
                "/admin/events",
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
            await reply(200, empty);
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
