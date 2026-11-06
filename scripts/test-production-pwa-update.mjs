import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
const root = path.resolve("dist"),
  tests = [],
  requests = [],
  port = 4185,
  origin = "http://127.0.0.1:" + port;
let browser,
  completed = false,
  buildRevision = 1;
const mime = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};
const check = (ok, name) => {
  if (!ok) throw Error(name);
  tests.push({ name, passed: true });
  console.info("PASS " + name);
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    res.setHeader("Cache-Control", "no-store");
    if (url.pathname === "/__queue-probe.mjs") {
      res.setHeader("Content-Type", "text/javascript");
      return res.end(await readFile("shared/public-queue.mjs"));
    }
    if (url.pathname === "/__queue-probe.html") {
      res.setHeader("Content-Type", "text/html");
      return res.end(
        '<!doctype html><html lang="en"><title>Owned queue verification</title><body><h1>Owned queue verification</h1></body></html>',
      );
    }
    if (url.pathname.startsWith("/api/")) {
      requests.push({ method: req.method, path: url.pathname });
      res.setHeader("Content-Type", "application/json");
      return res.end(
        JSON.stringify(
          url.pathname === "/api/v1/auth/session"
            ? {
                error: {
                  code: "UNAUTHENTICATED",
                  message: "No fictional session",
                },
              }
            : { data: { items: [] } },
        ),
      );
    }
    const safe = decodeURIComponent(url.pathname);
    let file = path.resolve(root, "." + safe);
    if (!file.startsWith(root + path.sep) && file !== root) {
      res.statusCode = 404;
      return res.end();
    }
    if (safe === "/" || !path.extname(safe))
      file = path.join(root, "index.html");
    let bytes;
    try {
      bytes = await readFile(file);
    } catch {
      res.statusCode = 404;
      return res.end("Not found");
    }
    res.setHeader(
      "Content-Type",
      mime[path.extname(file)] || "application/octet-stream",
    );
    res.end(
      file === path.join(root, "sw.js")
        ? Buffer.concat([
            bytes,
            Buffer.from(
              "\n// Owned update probe revision " + buildRevision + "\n",
            ),
          ])
        : bytes,
    );
  } catch {
    res.statusCode = 500;
    res.end("Owned static fixture failure");
  }
});

server.listen(port, "127.0.0.1");
await once(server, "listening");
try {
  browser = await chromium.launch();
  const ctx = await browser.newContext({
    serviceWorkers: "allow",
    reducedMotion: "reduce",
  });
  try {
    const one = await ctx.newPage();
    await one.goto(origin + "/offline");
    await one.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await one.reload();
    await expect
      .poll(() => one.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    const two = await ctx.newPage();
    await two.goto(origin + "/offline");
    for (const [page, email] of [
      [one, "fictional-first@example.test"],
      [two, "fictional-second@example.test"],
    ]) {
      await page
        .getByText("Save a newsletter signup for later", { exact: true })
        .click();
      await page
        .getByLabel("Newsletter email address", { exact: false })
        .fill(email);
      await page.evaluate(() => {
        window.ownedUpdateMarker = "unsaved marker";
      });
    }
    buildRevision = 2;
    await one.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      await r.update();
    });
    await expect
      .poll(() =>
        one.evaluate(
          async () =>
            !!(await navigator.serviceWorker.getRegistration())?.waiting,
        ),
      )
      .toBe(true);
    await one
      .getByRole("button", { name: "Update this tab", exact: true })
      .click();
    await expect(one.getByRole("alertdialog")).toBeVisible();
    await one.getByRole("button", { name: "Stay here", exact: true }).click();
    check(
      (await one
        .getByLabel("Newsletter email address", { exact: false })
        .inputValue()) === "fictional-first@example.test" &&
        (await one.evaluate(() => window.ownedUpdateMarker)) ===
          "unsaved marker" &&
        (await one.evaluate(
          async () =>
            !!(await navigator.serviceWorker.getRegistration())?.waiting,
        )),
      "declining production worker update preserves dirty fields and waiting version",
    );
    await one
      .getByRole("button", { name: "Update this tab", exact: true })
      .click();
    await expect(one.getByRole("alertdialog")).toBeVisible();
    await Promise.all([
      one.waitForEvent("load"),
      one
        .getByRole("button", { name: "Discard and leave", exact: true })
        .click(),
    ]);
    check(
      (await one.evaluate(() => window.ownedUpdateMarker)) === undefined,
      "approved production update reloads only the requesting dirty tab",
    );
    check(
      (await two.evaluate(() => window.ownedUpdateMarker)) ===
        "unsaved marker" &&
        (await two
          .getByLabel("Newsletter email address", { exact: false })
          .inputValue()) === "fictional-second@example.test",
      "second dirty tab keeps its fields and document across another tab's worker activation",
    );
    const state = await one.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      return { waiting: !!r.waiting, active: r.active?.state };
    });
    check(
      !state.waiting && state.active === "activated",
      "explicit update activates the waiting worker without automatic fleet reload",
    );
    check(
      !requests.some((r) => !["GET", "HEAD"].includes(r.method)),
      "multi-tab update probe performs no actual application mutation or provider send",
    );
    completed = true;
  } finally {
    await ctx.close();
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await writeFile(
    ".docs/phase0/production-pwa-update.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        scope:
          "Owned loopback production build. Worker bytes vary only by an appended probe-version comment; real waiting/activation and actual production dirty-navigation UI used in two tabs. Isolated context closed and static server stopped. Does not certify real device install/push, hosted retention of old hashed assets or changed-deployment rollback.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
