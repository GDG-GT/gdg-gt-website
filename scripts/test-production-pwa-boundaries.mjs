import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
const root = path.resolve("dist"),
  tests = [],
  requests = [],
  port = 4184,
  origin = "http://127.0.0.1:" + port;
let browser,
  completed = false;
const check = (ok, name) => {
  if (!ok) throw Error(name);
  tests.push({ name, passed: true });
  console.info("PASS " + name);
};
const mime = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
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
    }),
    page = await ctx.newPage();
  try {
    await page.goto(origin + "/offline");
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    await page.evaluate(async () => {
      await fetch("/api/v1/fictional-private-check");
      await fetch("/forms/fictional-private?access=fictional");
      await fetch("/admin/members");
    });
    const keys = await page.evaluate(async () => {
      const all = [];
      for (const name of await caches.keys())
        for (const request of await (await caches.open(name)).keys())
          all.push(new URL(request.url).pathname + new URL(request.url).search);
      return all;
    });
    check(
      keys.length > 0 &&
        !keys.some(
          (p) =>
            p.startsWith("/api/") ||
            p.startsWith("/admin") ||
            p.startsWith("/forms") ||
            [...new URL(p, origin).searchParams.keys()].some(
              (key) => key !== "__WB_REVISION__",
            ),
        ),
      "real service-worker CacheStorage contains only public enumerated assets",
    );
    check(
      keys.some((key) => new URL(key, origin).pathname === "/offline.html") &&
        !keys.includes("/__queue-probe.mjs"),
      "standalone offline fallback is cached and probe code is not",
    );
    await ctx.setOffline(true);
    await page.goto(origin + "/events");
    await expect(page.locator("h1")).toHaveCount(1);
    check(
      (await page.title()).length > 0 &&
        (await page
          .locator("body")
          .innerText()
          .then((s) => /offline|connection|pending/i.test(s))),
      "real offline public navigation loads truthful standalone fallback",
    );
    let denied = false;
    try {
      await page.goto(origin + "/admin/members");
    } catch {
      denied = true;
    }
    check(denied, "real worker refuses private admin navigation fallback");
    denied = false;
    try {
      await page.goto(origin + "/forms/fictional-private?access=fictional");
    } catch {
      denied = true;
    }
    check(
      denied,
      "real worker refuses private form/capability navigation fallback",
    );
    await ctx.setOffline(false);
    await page.close();
    // Use isolated pages that do not mount QueueRuntime. Both contexts still use real shared IndexedDB transactions.
    const one = await ctx.newPage(),
      two = await ctx.newPage();
    await one.goto(origin + "/__queue-probe.html");
    await two.goto(origin + "/__queue-probe.html");
    for (const tab of [one, two])
      await tab.evaluate(async () => {
        const m = await import("/__queue-probe.mjs");
        window.queueModule = m;
        window.readStoredQueue = async () => {
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open("gdg-gt-public-submissions-v1", 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(Error("Owned storage read failed"));
          });
          try {
            return await new Promise((resolve, reject) => {
              const request = db
                .transaction("queue", "readonly")
                .objectStore("queue")
                .getAll();
              request.onsuccess = () =>
                resolve(request.result.filter((row) => row.id !== "_control"));
              request.onerror = () =>
                reject(Error("Owned storage rows unavailable"));
            });
          } finally {
            db.close();
          }
        };
        window.probeTime = Date.now();
        window.queueCalls = [];
        window.queueMode = "accept";
        window.queue = m.createPublicQueue({
          clock: () => window.probeTime,
          fetcher: async (p, o) => {
            window.queueCalls.push({
              path: p,
              key: o.headers["Idempotency-Key"],
              credentials: o.credentials,
              body: JSON.parse(o.body),
            });
            if (window.queueMode === "hold")
              await new Promise((resolve) => {
                window.finishQueue = resolve;
              });
            if (window.queueMode === "lost") {
              window.queueMode = "accept";
              throw Error("Fictional accepted reply loss");
            }
            return new Response(
              JSON.stringify({
                data: p.includes("/registrations")
                  ? {
                      status: "registered",
                      registrationId: "fictional-confirmed",
                    }
                  : { accepted: true },
              }),
              {
                status: window.queueMode === "capacity" ? 409 : 200,
                headers: { "content-type": "application/json" },
              },
            );
          },
        });
      });
    await one.evaluate(() => window.queue.clear());
    const id = await one.evaluate(async () => {
      const id = crypto.randomUUID();
      await window.queue.add(
        "event",
        {
          slug: "fictional-workshop",
          name: "Fictional student",
          email: "fictional-student@example.test",
          notes: "",
          consent: true,
          website: "",
        },
        id,
      );
      return id;
    });
    await one.evaluate(() => {
      window.queueMode = "hold";
      window.finishQueue = undefined;
      window.runningQueue = window.queue.replay();
    });
    await expect
      .poll(() => one.evaluate(() => window.queueCalls.length))
      .toBe(1);
    await two.evaluate(() => window.queue.replay());
    check(
      (await two.evaluate(() => window.queueCalls.length)) === 0,
      "two real tabs serialize queue claims through IndexedDB and do not duplicate an in-flight request",
    );
    await one.evaluate(async () => {
      window.finishQueue();
      await window.runningQueue;
    });
    const rows = await one.evaluate(() => window.readStoredQueue());
    check(
      rows.length === 1 &&
        rows[0].state === "accepted" &&
        Object.keys(rows[0].payload || {}).length === 0,
      "confirmed queue outcome removes stored personal payload",
    );
    const calls = await one.evaluate(() => window.queueCalls);
    check(
      calls[0].key === id &&
        calls[0].credentials === "omit" &&
        calls[0].path === "/api/v1/events/fictional-workshop/registrations",
      "real queue preserves original key and exact public endpoint without credentials",
    );
    await one.evaluate(() => window.queue.clear());
    await one.evaluate(async () => {
      await window.queue.add("newsletter", {
        email: "fictional-expired@example.test",
        website: "",
      });
      window.probeTime += 48 * 3600000 + 1;
    });
    const before = await one.evaluate(() => window.queueCalls.length);
    await one.evaluate(() => window.queue.replay());
    const expired = await one.evaluate(() => window.readStoredQueue());
    check(
      expired[0].state === "expired" &&
        Object.keys(expired[0].payload || {}).length === 0 &&
        (await one.evaluate(() => window.queueCalls.length)) === before,
      "real 48-hour IndexedDB expiry erases payload and prevents replay without waiting or changing system clock",
    );
    await one.evaluate(() => window.queue.clear());
    await one.evaluate(async () => {
      window.queueMode = "capacity";
      await window.queue.add("event", {
        slug: "fictional-full",
        name: "Fictional student",
        email: "fictional-full@example.test",
        consent: true,
        website: "",
      });
      await window.queue.replay();
    });
    const failed = await one.evaluate(() => window.readStoredQueue());
    check(
      failed[0].state === "failed" &&
        Object.keys(failed[0].payload || {}).length === 0,
      "real event-capacity 409 permanently stops device replay and clears personal payload",
    );
    await one.evaluate(() => window.queue.clear());
    await one.evaluate(async () => {
      window.queueMode = "lost";
      await window.queue.add("newsletter", {
        email: "fictional-lost@example.test",
        website: "",
      });
      await window.queue.replay();
    });
    const pending = await one.evaluate(() => window.readStoredQueue());
    check(
      pending[0].state === "pending",
      "lost accepted queue reply remains unconfirmed rather than claiming success",
    );
    await one.evaluate(async () => {
      await window.queue.retry((await window.queue.list())[0].id);
      await window.queue.replay();
    });
    const last = await one.evaluate(() => window.queueCalls.slice(-2));
    check(
      last[0].key === last[1].key &&
        (await one.evaluate(
          async () => (await window.queue.list())[0].state,
        )) === "accepted",
      "explicit lost-reply retry reuses the original persisted key",
    );
    await one.evaluate(() => window.queue.clear());
    await one.evaluate(async () => {
      window.queueMode = "hold";
      window.finishQueue = undefined;
      await window.queue.add("newsletter", {
        email: "fictional-clear@example.test",
        website: "",
      });
      window.runningQueue = window.queue.replay();
    });
    await expect
      .poll(() => one.evaluate(() => !!window.finishQueue))
      .toBe(true);
    await two.evaluate(() => window.queue.clear());
    await one.evaluate(async () => {
      window.finishQueue();
      await window.runningQueue;
    });
    check(
      (await one.evaluate(() => window.queue.list())).length === 0,
      "cross-tab logout-style clear epoch prevents late network acknowledgement resurrecting private queue data",
    );
    const privacy = await one.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    }));
    check(
      !privacy.local.length && !privacy.session.length,
      "real queue personal payload never enters localStorage or sessionStorage",
    );
    await one.evaluate(() => window.queue.clear());
    await one.close();
    await two.close();
    check(
      !requests.some((r) => r.method !== "GET" && r.method !== "HEAD"),
      "PWA/queue probe performs no provider or actual application mutations",
    );
    completed = true;
  } finally {
    await ctx.close();
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await mkdir(".docs/phase0", { recursive: true });
  await writeFile(
    ".docs/phase0/production-pwa-boundaries.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        scope:
          "Owned loopback static production build with fictional API/fetch responses. Real worker/CacheStorage/offline routing and IndexedDB multi-tab/expiry/lost-reply/capacity/clear. Fresh isolated browser context closed, static server stopped, no real providers/production/application writes. Does not certify installed-device UI, multi-build update rollout, actual push permission/delivery or hosted cache headers.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
