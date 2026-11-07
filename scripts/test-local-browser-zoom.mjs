import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { localHttp } from "./lib/local-http.mjs";
import { localBrowserZoom } from "./lib/local-browser-zoom.mjs";
import { hashSecret } from "../server/lib/security.mjs";
import { createTemplate, newField } from "../shared/forms.ts";
const h = await localHttp(), { db, env } = h, actor = randomUUID(),
  password = "Fictional-zoom-" + randomUUID(), email = `fictional-zoom-${actor}@example.test`,
  checks = [], require = createRequire(import.meta.url),
  axe = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
let owner, form, completed = false, cleanupComplete = false;
const checked = (r) => { if (r.error) throw Error("Zoom fixture database operation failed " + r.error.code); return r.data; };
const data = (r) => { if (r.status !== 200) throw Error("Zoom fixture API failed " + r.status); return r.json.data; };
try {
  checked(await db.from("admin_users").insert({ id: actor, email, password_hash: await hashSecret(password), role: "super_admin", is_active: true, display_name: "Fictional actual browser zoom reviewer" }));
  data(await h.call("/auth/gate", { method: "POST", body: { code: h.credentials.gateCode } }));
  data(await h.call("/auth/login", { method: "POST", body: { email, password } }));
  const draft = createTemplate("Fictional browser zoom form " + actor.slice(0, 8), "blank"), question = newField("short", draft.sections[0].id);
  question.label = "Your fictional accessibility answer";
  form = data(await h.call("/admin/forms", { method: "POST", body: { slug: draft.slug, definition: { title: draft.title, description: draft.description, settings: draft.settings, sections: draft.sections, fields: [question] } } })).form;
  form = data(await h.call(`/admin/forms/${form.id}/publish`, { method: "POST", body: { revision: form.revision } })).form;
  const routes = ["/", "/events", "/team", "/resources", "/sponsors", "/gallery", "/contact", "/privacy", "/accessibility", "/offline", "/forms/" + form.slug,
    "/admin", ...["events", "content", "team", "projects", "members", "resources", "newsletter", "blog", "users", "profile", "sponsors", "communications", "media", "guide", "linktree", "site-status", "teams", "channels", "whiteboard", "gallery", "finances", "audit-log", "privacy", "operations", "blog-editor", "blog-media", "forms"].map((p) => "/admin/" + p),
    `/admin/forms/${form.id}/edit`, `/admin/forms/${form.id}/responses`];
  for (const width of [1440, 1920]) {
    owner = await localBrowserZoom(width, 900);
    const { context } = owner;
    for (const [path, body] of [["/auth/gate", { code: h.credentials.gateCode }], ["/auth/login", { email, password }]]) {
      const r = await context.request.post(env.APP_ORIGIN + "/api/v1" + path, { headers: { Origin: env.APP_ORIGIN }, data: body });
      if (r.status() !== 200) throw Error("Actual zoom browser sign-in failed " + r.status());
    }
    const page = await context.newPage();
    let errors = [], failures = [], writes = [];
    page.on("pageerror", (error) => errors.push(error.name));
    page.on("response", (response) => { const r = response.request(); if (r.method() === "GET" && new URL(r.url()).pathname.startsWith("/api/") && response.status() >= 400) failures.push(response.status()); });
    await context.route("**/*", (route) => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== env.APP_ORIGIN) return route.abort("blockedbyclient");
      if (url.pathname.startsWith("/api/") && !["GET", "HEAD"].includes(request.method())) {
        if (["/api/v1/auth/realtime-token", "/api/v1/realtime/token"].includes(url.pathname)) return route.fulfill({ status: 503, json: { error: { code: "TEMPORARILY_UNAVAILABLE", message: "Live updates paused during read-only reflow verification." } } });
        writes.push(request.method() + " " + url.pathname); return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    for (const route of routes) {
      errors = []; failures = []; writes = [];
      await page.goto(env.APP_ORIGIN + route, { waitUntil: "networkidle" });
      const zoom = await owner.setZoom(page, 2);
      await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width / 2);
      await page.evaluate(() => document.fonts.ready);
      // Same document is reviewed under browser-rendered forced colors too;
      // this emulates the media feature, not a physical Windows OS review.
      for (const forcedColors of ["none", "active"]) {
        await page.emulateMedia({ forcedColors, reducedMotion: "reduce" });
        await page.evaluate(axe);
        const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } })).violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })));
        const layout = await page.evaluate(() => ({ innerWidth, outerWidth, dpr: devicePixelRatio, scrollWidth: document.documentElement.scrollWidth, cssZoom: getComputedStyle(document.documentElement).zoom, headings: document.querySelectorAll("h1").length, forcedColors: matchMedia("(forced-colors: active)").matches }));
        const passed = zoom === 2 && layout.innerWidth === width / 2 && layout.outerWidth === width && layout.cssZoom === "1" && layout.scrollWidth <= layout.innerWidth && layout.headings === 1 && !violations.length && !errors.length && !failures.length && !writes.length && layout.forcedColors === (forcedColors === "active");
        const path = route.replace(form.id, ":owned-form").replace(form.slug, ":owned-form");
        checks.push({ path, browserWindowWidth: width, actualBrowserZoom: zoom, forcedColors, layout, violations, pageErrorNames: [...errors], failedReadStatuses: [...failures], blockedWrites: [...writes], passed });
        console.info((passed ? "PASS " : "FAIL ") + path + " actual 200% zoom at " + width + " / forced colors " + forcedColors);
      }
      await page.emulateMedia({ forcedColors: "none", reducedMotion: "reduce" });
    }
    await owner.close(); owner = undefined;
  }
  completed = checks.every((c) => c.passed);
} finally {
  await owner?.close();
  if (form) checked(await db.from("forms").update({ state: "Archived", archived_at: new Date().toISOString() }).eq("id", form.id).eq("owner_id", actor));
  await h.logout();
  checked(await db.from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("admin_user_id", actor).is("revoked_at", null));
  checked(await db.from("admin_users").update({ is_active: false, deleted_at: new Date().toISOString() }).eq("id", actor));
  cleanupComplete = true;
  await writeFile(new URL("../.docs/phase0/local-actual-browser-zoom.json", import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), completed, cleanupComplete, scope: "Actual Chromium tabs.setZoom(2) in automatic/per-tab mode, independent owned temporary extension/profile, with getZoom=2, doubled devicePixelRatio, halved CSS viewport and CSS zoom=1 assertions. Existing app OS/browser profiles unchanged. Real loopback UI/API reads, fresh fictional account/form, writes blocked after fixture preparation; Realtime grant paused. Forced colors uses browser media emulation and does not certify actual OS high-contrast or manual screen-reader behavior. No deployment or provider sends.", reference: "https://developer.chrome.com/docs/extensions/reference/api/tabs#method-setZoom", checks }, null, 2) + "\n");
}
if (!completed) process.exitCode = 1;
