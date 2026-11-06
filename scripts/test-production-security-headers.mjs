import { createServer } from "node:https";
import { readFile, writeFile, mkdtemp, chmod, rm } from "node:fs/promises";
import { once } from "node:events";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
const root = path.resolve("dist"),
  origin = "https://127.0.0.1:4187",
  tests = [],
  unexpected = [],
  config = JSON.parse(await readFile("vercel.json", "utf8"));
const headerGroup = (source) => {
  const row = config.headers.find((r) => r.source === source);
  if (!row) throw Error("Required configured header group is absent.");
  return row.headers;
};
const common = headerGroup("/(.*)"),
  csp = common.find(
    (h) => h.key.toLowerCase() === "content-security-policy",
  )?.value;
if (!csp || !csp.includes("script-src 'self'") || csp.includes("'unsafe-eval'"))
  throw Error("Configured executable-content policy is missing or permissive.");
const check = (condition, name) => {
  if (!condition) throw Error(name);
  tests.push({ name, passed: true });
  console.info("PASS " + name);
};
const scratch = await mkdtemp(path.join(tmpdir(), "gdg-owned-tls-"));
await chmod(scratch, 0o700);
let server,
  browser,
  completed = false,
  isolatedReports = 0;
try {
  const key = path.join(scratch, "key.pem"),
    cert = path.join(scratch, "cert.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-subj",
      "/CN=127.0.0.1",
      "-addext",
      "subjectAltName=IP:127.0.0.1",
      "-keyout",
      key,
      "-out",
      cert,
    ],
    { stdio: "ignore" },
  );
  server = createServer(
    { key: await readFile(key), cert: await readFile(cert) },
    async (req, res) => {
      try {
        const url = new URL(req.url, origin);
        for (const h of common) res.setHeader(h.key, h.value);
        // Browser-generated reports from the deliberate inline probe terminate
        // here. No report bytes reach the application API, database or a provider.
        if (req.method === "POST" && url.pathname === "/api/v1/csp-reports") {
          isolatedReports++;
          req.resume();
          res.statusCode = 204;
          return res.end();
        }
        if (!["GET", "HEAD"].includes(req.method)) {
          unexpected.push("Non-read request");
          res.statusCode = 405;
          return res.end();
        }
        const group =
          url.pathname === "/sw.js"
            ? "/sw.js"
            : url.pathname === "/manifest.json"
              ? "/manifest.json"
              : url.pathname.startsWith("/api/")
                ? "/api/(.*)"
                : null;
        if (group)
          for (const h of headerGroup(group)) res.setHeader(h.key, h.value);
        if (url.pathname.startsWith("/assets/"))
          for (const row of config.headers.filter((row) =>
            row.source.startsWith("/assets/"),
          ))
            if (new RegExp("^" + row.source + "$", "u").test(url.pathname))
              for (const h of row.headers) res.setHeader(h.key, h.value);
        if (url.pathname === "/api/v1/auth/session") {
          res.statusCode = 401;
          res.setHeader("Content-Type", "application/json");
          return res.end(
            JSON.stringify({
              error: { code: "UNAUTHENTICATED", message: "No probe account" },
            }),
          );
        }
        if (url.pathname.startsWith("/api/")) {
          if (
            !/^\/api\/v1\/(?:public\/home|site-status|events(?:\/[a-z0-9-]+)?|team|resources|sponsors|sponsor-tiers|sponsor-stats|gallery)$/.test(
              url.pathname,
            )
          ) {
            unexpected.push("Unlisted API read");
            res.statusCode = 404;
            return res.end();
          }
          const r = await fetch(
            "http://127.0.0.1:8081" + url.pathname + url.search,
            {
              headers: { Origin: "http://127.0.0.1:8080" },
              signal: AbortSignal.timeout(10000),
            },
          );
          res.statusCode = r.status;
          res.setHeader("Content-Type", "application/json");
          return res.end(Buffer.from(await r.arrayBuffer()));
        }
        let file = path.resolve(root, "." + decodeURIComponent(url.pathname));
        if (!file.startsWith(root + path.sep) && file !== root) {
          res.statusCode = 404;
          return res.end();
        }
        if (url.pathname === "/" || !path.extname(url.pathname)) {
          file = path.join(root, "index.html");
          res.setHeader("Cache-Control", "no-store");
        }
        let bytes;
        try {
          bytes = await readFile(file);
        } catch {
          res.statusCode = 404;
          return res.end();
        }
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
        res.setHeader(
          "Content-Type",
          mime[path.extname(file)] || "application/octet-stream",
        );
        res.end(req.method === "HEAD" ? undefined : bytes);
      } catch {
        res.statusCode = 503;
        res.end();
      }
    },
  );
  server.listen(4187, "127.0.0.1");
  await once(server, "listening");
  browser = await chromium.launch();
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  try {
    await ctx.route("**/*", (route) => {
      if (new URL(route.request().url()).origin !== origin) {
        unexpected.push("External request blocked");
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    for (const route of ["/", "/events", "/contact", "/privacy"]) {
      const page = await ctx.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.name));
      await page.addInitScript(() => {
        window.ownedCspViolations = [];
        document.addEventListener("securitypolicyviolation", (e) => {
          window.ownedCspViolations.push({
            directive: e.effectiveDirective,
            disposition: e.disposition,
          });
        });
      });
      const response = await page.goto(origin + route);
      for (const h of common)
        check(
          (await response.headerValue(h.key)) === h.value,
          "configured " + h.key + " served on " + route,
        );
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator(".gt-availability-frame")).toHaveJSProperty(
        "inert",
        false,
      );
      check(
        errors.length === 0,
        "production route renders without page exceptions under enforced CSP: " +
          route,
      );
      check(
        (await page.evaluate(() => window.ownedCspViolations)).length === 0,
        "production route raises no policy violations: " + route,
      );
      await page.evaluate(() => {
        const script = document.createElement("script");
        script.textContent = "window.ownedInlineCspProbe = true";
        document.head.append(script);
        script.remove();
      });
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.ownedCspViolations.some(
              (v) =>
                v.directive === "script-src-elem" &&
                v.disposition === "enforce",
            ),
          ),
        )
        .toBe(true);
      check(
        await page.evaluate(() => window.ownedInlineCspProbe === undefined),
        "inline executable probe is blocked: " + route,
      );
      await page.close();
    }
    for (const [route, source] of [
      ["/sw.js", "/sw.js"],
      ["/manifest.json", "/manifest.json"],
      ["/api/v1/site-status", "/api/(.*)"],
    ]) {
      const r = await ctx.request.get(origin + route);
      for (const h of headerGroup(source))
        check(
          r.headers()[h.key.toLowerCase()] === h.value,
          "configured " + h.key + " served on " + route,
        );
    }
    const manifest = JSON.parse(
      await readFile(path.join(root, ".vite/manifest.json"), "utf8"),
    );
    for (const [file, expected] of [
      [manifest["index.html"].file, "public, max-age=31536000, immutable"],
      [
        "assets/hero-atmosphere-mobile.webp",
        "public, max-age=0, must-revalidate",
      ],
      ["assets/inter-latin.woff2", "public, max-age=0, must-revalidate"],
      ["assets/public-entry.js", "public, max-age=0, must-revalidate"],
    ]) {
      const r = await ctx.request.get(origin + "/" + file);
      check(
        r.ok() && r.headers()["cache-control"] === expected,
        "hashed bundles and stable public artwork/fonts receive separate cache lifetimes: " +
          file,
      );
    }
    check(
      unexpected.length === 0,
      "TLS/CSP probe performs only allowlisted local reads and isolated CSP reports, with no application writes/provider sends",
    );
    completed = true;
  } finally {
    await ctx.close();
  }
} finally {
  await browser?.close();
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await rm(scratch, { recursive: true, force: true });
  await writeFile(
    ".docs/phase0/production-security-headers.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        isolatedReports,
        scope:
          "Isolated HTTPS loopback production build with the exact common CSP/security header values from vercel.json, including upgrade-insecure-requests. Ephemeral one-day self-signed loopback certificate is trusted only by this isolated context and removed afterward. Actual hosted TLS/certificate/header precedence, third-party frames, authenticated editors, WebGL, service workers and deployed caching remain separate acceptance. Anonymous allowlisted reads plus browser CSP reports terminated without inspecting/storing their bodies in this owned server; reports never reach the application API. All external requests and other non-read methods are refused. No credentials/application writes/provider sends.",
        tests,
        unexpected,
      },
      null,
      2,
    ) + "\n",
  );
}
