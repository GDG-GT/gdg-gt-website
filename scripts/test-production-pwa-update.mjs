import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { createHash } from "node:crypto";
import { chromium, expect } from "@playwright/test";
const root = path.resolve("dist"),
  tests = [],
  requests = [],
  port = 4185,
  origin = "http://127.0.0.1:" + port;
let browser,
  completed = false,
  buildRevision = 1;
const offlineDocument = await readFile(path.join(root, "offline.html"), "utf8");
const offlineBytes = () =>
  Buffer.from(
    offlineDocument +
      "\n<!-- Owned offline asset revision " +
      buildRevision +
      " -->\n",
  );
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
    if (file === path.join(root, "offline.html")) bytes = offlineBytes();
    if (file === path.join(root, "sw.js")) {
      const source = bytes.toString(),
        pattern = /\{"revision":"[a-f0-9]+","url":"offline\.html"\}/g;
      if ([...source.matchAll(pattern)].length !== 1)
        throw Error("Expected exactly one production offline precache entry");
      bytes = Buffer.from(
        source.replace(
          pattern,
          JSON.stringify({
            revision: createHash("sha256").update(offlineBytes()).digest("hex"),
            url: "offline.html",
          }),
        ),
      );
    }
    res.end(bytes);
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
    check(
      await one.evaluate(async () =>
        (await (await fetch("/offline.html")).text()).includes(
          "Owned offline asset revision 1",
        ),
      ),
      "initial production worker serves its reviewed offline asset revision",
    );
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
    check(
      await one.evaluate(async () =>
        (await (await fetch("/offline.html")).text()).includes(
          "Owned offline asset revision 1",
        ),
      ),
      "waiting changed offline asset does not replace the active version before explicit approval",
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
      await one.evaluate(async () =>
        (await (await fetch("/offline.html")).text()).includes(
          "Owned offline asset revision 2",
        ),
      ),
      "approved worker activates the newly revisioned offline asset",
    );
    await expect
      .poll(() =>
        one.evaluate(async () => {
          const entries = [];
          for (const name of await caches.keys()) {
            const cache = await caches.open(name);
            for (const key of await cache.keys())
              if (new URL(key.url).pathname === "/offline.html")
                entries.push(await (await cache.match(key)).text());
          }
          return (
            entries.length === 1 &&
            entries[0].includes("Owned offline asset revision 2")
          );
        }),
      )
      .toBe(true);
    check(true, "activation removes the obsolete offline asset cache revision");
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
          "Owned loopback production build. Offline HTML bytes vary by an inert revision comment, and the production worker's exact precache entry receives the matching SHA-256 revision. Real waiting/activation/cache cleanup and actual production dirty-navigation UI used in two tabs. Isolated context closed and static server stopped. Does not certify real device install/push, hosted retention of old hashed JS assets or changed-deployment rollback.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
