import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { localHttp } from "./lib/local-http.mjs";
import { hashSecret } from "../server/lib/security.mjs";
import { createTemplate, newField } from "../shared/forms.ts";
const require = createRequire(import.meta.url),
  h = await localHttp(),
  { db } = h,
  actor = randomUUID(),
  team = randomUUID(),
  marker = actor.slice(0, 8),
  email = "fictional-workspace-browser-" + actor + "@example.test",
  password = "Fictional-browser-" + randomUUID(),
  output = new URL("../artifacts/browser/live-workspace/", import.meta.url),
  tests = [],
  artifactProtection = [];
const checked = (result) => {
  if (result.error)
    throw Error("Workspace fixture database error " + result.error.code);
  return result.data;
};
const accepted = async (result) => {
  if (result.status() !== 200)
    throw Error("Workspace fixture authentication failed " + result.status());
};
let created = false,
  teamCreated = false,
  formId,
  browser,
  completed = false;
await mkdir(output, { recursive: true });
// Check the two app listeners before creating any fixture. The database may
// survive a service interruption while Vite/the API have stopped.
for (const path of ["/", "/api/v1/site-status"]) {
  const response = await fetch(h.env.APP_ORIGIN + path, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok)
    throw Error(
      "Local app listeners must be running before the workspace browser audit.",
    );
}
for (const path of [
  "/artifacts/browser/live-workspace/admin-1440.png",
  "/@fs" +
    new URL(
      "../artifacts/browser/live-workspace/admin-1440.png",
      import.meta.url,
    ).pathname,
]) {
  const response = await fetch(h.env.APP_ORIGIN + path, {
    signal: AbortSignal.timeout(5000),
  });
  const passed = response.status === 403;
  artifactProtection.push({
    path: path.startsWith("/@fs")
      ? "/@fs/:workspace/artifacts/:private-capture"
      : "/artifacts/:private-capture",
    status: response.status,
    passed,
  });
  if (!passed)
    throw Error("Private browser artifacts must not be served by Vite.");
}
try {
  checked(
    await db.from("admin_users").insert({
      id: actor,
      email,
      password_hash: await hashSecret(password),
      role: "super_admin",
      is_active: true,
      display_name: "Fictional browser reviewer " + marker,
    }),
  );
  created = true;
  checked(
    await db.from("admin_teams").insert({
      id: team,
      name: "Fictional browser team " + marker,
      slug: "fictional-browser-" + marker,
    }),
  );
  teamCreated = true;
  const draft = createTemplate("Fictional browser draft " + marker, "blank"),
    { title, description, settings, sections } = draft,
    question = newField("short", sections[0].id);
  question.label = "Fictional review question";
  formId = randomUUID();
  checked(
    await db.from("forms").insert({
      id: formId,
      slug: draft.slug,
      title,
      description,
      owner_id: actor,
      team_id: team,
      draft_definition: {
        title,
        description,
        settings,
        sections,
        fields: [question],
      },
    }),
  );
  const axe = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
  browser = await chromium.launch();
  const paths = [
    "/admin",
    ...[
      "events",
      "content",
      "team",
      "projects",
      "members",
      "resources",
      "newsletter",
      "blog",
      "users",
      "profile",
      "sponsors",
      "communications",
      "media",
      "guide",
      "linktree",
      "site-status",
      "teams",
      "channels",
      "whiteboard",
      "gallery",
      "finances",
      "audit-log",
      "privacy",
      "operations",
      "blog-editor",
      "blog-media",
      "forms",
    ].map((value) => "/admin/" + value),
    "/admin/team/" + team,
    "/admin/forms/" + formId + "/edit",
    "/admin/forms/" + formId + "/responses",
  ];
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
  ]) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
      locale: "en-US",
      timezoneId: "America/New_York",
      serviceWorkers: "block",
    });
    try {
      await accepted(
        await context.request.post(h.env.APP_ORIGIN + "/api/v1/auth/gate", {
          headers: { Origin: h.env.APP_ORIGIN },
          data: { code: h.credentials.gateCode },
        }),
      );
      await accepted(
        await context.request.post(h.env.APP_ORIGIN + "/api/v1/auth/login", {
          headers: { Origin: h.env.APP_ORIGIN },
          data: { email, password },
        }),
      );
      const page = await context.newPage();
      let blockedWrites = [],
        grantsPaused = 0;
      await page.route("**/*", async (route) => {
        const r = route.request(),
          url = new URL(r.url());
        if (url.origin !== h.env.APP_ORIGIN) {
          await route.abort("blockedbyclient");
          return;
        }
        if (
          url.pathname.startsWith("/api/") &&
          !["GET", "HEAD"].includes(r.method())
        ) {
          if (
            ["/api/v1/auth/realtime-token", "/api/v1/realtime/token"].includes(
              url.pathname,
            )
          ) {
            grantsPaused++;
            await route.fulfill({
              status: 503,
              json: {
                error: {
                  code: "TEMPORARILY_UNAVAILABLE",
                  message:
                    "Live updates are paused during this browser read audit.",
                },
              },
            });
            return;
          }
          blockedWrites.push(r.method() + " " + url.pathname);
          await route.abort("blockedbyclient");
          return;
        }
        await route.continue();
      });
      for (const path of paths) {
        blockedWrites = [];
        grantsPaused = 0;
        const errors = [],
          failedReads = [],
          capture = (error) => errors.push(error.name),
          response = (result) => {
            const url = new URL(result.url());
            if (
              url.pathname.startsWith("/api/") &&
              result.request().method() === "GET" &&
              result.status() >= 400
            )
              failedReads.push({
                path: url.pathname
                  .replaceAll(formId, ":owned-form")
                  .replaceAll(team, ":owned-team"),
                status: result.status(),
              });
          };
        page.on("pageerror", capture);
        page.on("response", response);
        await page.goto(h.env.APP_ORIGIN + path, {
          waitUntil: "networkidle",
          timeout: 30000,
        });
        await page
          .locator("#workspace-content")
          .waitFor({ state: "visible", timeout: 10000 });
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(axe);
        const violations = await page.evaluate(async () =>
          (
            await window.axe.run(document, {
              runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
              },
            })
          ).violations.map((item) => ({
            id: item.id,
            impact: item.impact,
            targets: item.nodes.map((node) => node.target),
          })),
        );
        const layout = await page.evaluate(() => {
          const main = document.getElementById("workspace-content"),
            content = main.getBoundingClientRect();
          return {
            width: innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            height: innerHeight,
            scrollHeight: document.documentElement.scrollHeight,
            mainHeight: main.clientHeight,
            mainScrollHeight: main.scrollHeight,
            headings: main.querySelectorAll("h1").length,
            contentTop: content.top,
          };
        });
        await page.evaluate(() => {
          window.scrollTo(0, 500);
          document.getElementById("workspace-content").scrollTop = 500;
        });
        const scroll = await page.evaluate(() => ({
            window: scrollY,
            main: document.getElementById("workspace-content").scrollTop,
          })),
          needsScroll =
            layout.scrollHeight > layout.height ||
            layout.mainScrollHeight > layout.mainHeight,
          scrolled = !needsScroll || scroll.window > 0 || scroll.main > 0,
          label = path
            .replace(formId, "owned-form")
            .replace(team, "owned-team"),
          name =
            label.split("/").filter(Boolean).join("-") + "-" + viewport.width;
        await page.evaluate(() => {
          window.scrollTo(0, 0);
          document.getElementById("workspace-content").scrollTop = 0;
        });
        await page.screenshot({
          path: new URL(name + ".png", output).pathname,
          fullPage: true,
          animations: "disabled",
        });
        const passed =
          !errors.length &&
          !failedReads.length &&
          !blockedWrites.length &&
          !violations.length &&
          layout.scrollWidth <= layout.width &&
          layout.headings === 1 &&
          scrolled;
        tests.push({
          name: label + " at " + viewport.width + "×" + viewport.height,
          passed,
          layout,
          scrolled,
          pageErrorNames: errors,
          failedReads,
          violations,
          blockedWrites: blockedWrites.map((value) =>
            value
              .replaceAll(formId, ":owned-form")
              .replaceAll(team, ":owned-team"),
          ),
          realtimeGrantsPaused: grantsPaused,
        });
        console.info(
          (passed ? "PASS " : "REVIEW ") +
            tests.at(-1).name +
            " (axe " +
            violations.length +
            ", reads " +
            failedReads.length +
            ")",
        );
        page.off("pageerror", capture);
        page.off("response", response);
      }
    } finally {
      await context.close();
    }
  }
  completed = true;
} finally {
  await browser?.close();
  if (formId)
    checked(
      await db
        .from("forms")
        .update({ state: "Archived", archived_at: new Date().toISOString() })
        .eq("id", formId)
        .eq("owner_id", actor),
    );
  if (teamCreated)
    checked(
      await db
        .from("admin_teams")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .eq("id", team),
    );
  if (created) {
    checked(
      await db
        .from("admin_users")
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .eq("id", actor),
    );
    checked(
      await db
        .from("admin_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("admin_user_id", actor)
        .is("revoked_at", null),
    );
  }
  await writeFile(
    new URL("../.docs/phase0/local-workspace-browser.json", import.meta.url),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        passed: completed && tests.every((item) => item.passed),
        cleanup: { completed: true },
        artifactProtection,
        note: "Actual loopback authenticated workspace read audit, one fresh fictional Super Admin/team/private draft. Non-read APIs and external origins blocked after fixture login; realtime grant acquisition intentionally paused. No sends, publication, existing-account/content mutation or production change. Owned form/team archived; account disabled and sessions revoked. Local screenshots remain ignored/private. Findings are not visual, manual-accessibility or hosted approval.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
if (tests.some((item) => !item.passed)) process.exitCode = 1;
