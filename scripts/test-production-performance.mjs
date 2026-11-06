import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { once } from "node:events";
import { spawn } from "node:child_process";
import path from "node:path";
import { chromium } from "@playwright/test";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
const root = path.resolve("dist"),
  port = 4186,
  origin = "http://127.0.0.1:" + port,
  output = path.resolve("artifacts/performance"),
  tests = [];
const build = {};
for (const file of [
  "index.html",
  ".vite/manifest.json",
  "assets/hero-atmosphere-mobile.webp",
  "assets/hero-campus-mobile.webp",
]) {
  const bytes = await readFile(path.join(root, file));
  build[file] = {
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
const args = process.argv.slice(2);
if (args.length && (args.length !== 1 || args[0] !== "--home-mobile"))
  throw Error("Optional diagnostic argument: --home-mobile");
const presets = args.length ? ["mobile"] : ["mobile", "desktop"],
  routes = args.length ? ["/"] : ["/", "/events", "/contact"],
  evidence = args.length
    ? "production-performance-home-mobile.json"
    : "production-performance.json";
const cli = process.env.GDG_LIGHTHOUSE_CLI;
if (
  !cli ||
  !path.isAbsolute(cli) ||
  !cli.endsWith("/node_modules/lighthouse/cli/index.js")
)
  throw Error(
    "Set GDG_LIGHTHOUSE_CLI to the verified temporary Lighthouse installation.",
  );
const packageInfo = JSON.parse(
  await readFile(path.resolve(cli, "../../package.json"), "utf8"),
);
if (packageInfo.version !== "13.6.0")
  throw Error(
    "Performance probe requires the reviewed pinned Lighthouse 13.6.0.",
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
const compressed = new Map();
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    res.setHeader("Cache-Control", "no-store");
    if (!["GET", "HEAD"].includes(req.method)) {
      res.statusCode = 405;
      return res.end("Read-only performance probe");
    }
    if (url.pathname === "/api/v1/auth/session") {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      return res.end(
        JSON.stringify({
          error: {
            code: "UNAUTHENTICATED",
            message: "No performance probe account",
          },
        }),
      );
    }
    if (url.pathname.startsWith("/api/")) {
      if (
        !/^\/api\/v1\/(?:public\/home|site-status|events(?:\/[a-z0-9-]+)?|team|resources|sponsors|sponsor-tiers|sponsor-stats|gallery)$/.test(
          url.pathname,
        )
      ) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        return res.end(
          JSON.stringify({
            error: { code: "NOT_FOUND", message: "Unlisted performance read" },
          }),
        );
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
    if (
      [".js", ".css", ".html", ".json", ".svg"].includes(path.extname(file))
    ) {
      res.setHeader("Vary", "Accept-Encoding");
      if (/\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
        if (!compressed.has(file)) compressed.set(file, gzipSync(bytes));
        bytes = compressed.get(file);
        res.setHeader("Content-Encoding", "gzip");
      }
    }
    res.setHeader("Content-Length", bytes.length);
    res.end(bytes);
  } catch {
    res.statusCode = 503;
    res.end("Owned performance server unavailable");
  }
});
await mkdir(output, { recursive: true });
server.listen(port, "127.0.0.1");
await once(server, "listening");
let completed = false;
try {
  for (const preset of presets)
    for (const route of routes) {
      const label = (route === "/" ? "home" : route.slice(1)) + "-" + preset,
        reportPath = path.join(output, label + ".json"),
        args = [
          cli,
          origin + route,
          "--quiet",
          "--output=json",
          "--output-path=" + reportPath,
          "--only-categories=performance,accessibility,best-practices,seo",
          "--chrome-flags=--headless",
          "--blocked-url-patterns=https://*",
          ...(preset === "desktop" ? ["--preset=desktop"] : []),
        ];
      const result = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, args, {
          env: { ...process.env, CHROME_PATH: chromium.executablePath() },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stderr = "";
        child.stderr.on("data", (chunk) => {
          stderr += chunk;
        });
        child.on("error", reject);
        child.on("close", (code) => resolve({ code, stderr }));
      });
      if (result.code !== 0)
        throw Error(
          "Lighthouse " + label + " failed; inspect the isolated report.",
        );
      const r = JSON.parse(await readFile(reportPath, "utf8")),
        score = (k) => Math.round((r.categories[k]?.score || 0) * 100),
        audits = r.audits;
      const row = {
        route,
        preset,
        performance: score("performance"),
        accessibility: score("accessibility"),
        bestPractices: score("best-practices"),
        seo: score("seo"),
        lcpMs: audits["largest-contentful-paint"]?.numericValue,
        cls: audits["cumulative-layout-shift"]?.numericValue,
        tbtMs: audits["total-blocking-time"]?.numericValue,
        failedAudits: Object.entries(audits)
          .filter(
            ([, v]) =>
              v.score !== null &&
              v.score < 1 &&
              v.scoreDisplayMode !== "manual" &&
              v.scoreDisplayMode !== "informative",
          )
          .map(([id, v]) => ({
            id,
            title: v.title,
            score: v.score,
            display: v.displayValue,
          })),
        runtimeError: r.runtimeError?.code || null,
      };
      row.passed =
        !row.runtimeError &&
        row.performance >= 90 &&
        row.accessibility === 100 &&
        row.lcpMs <= 2500 &&
        row.cls <= 0.1;
      tests.push(row);
      console.info(
        JSON.stringify({
          route,
          preset,
          performance: row.performance,
          accessibility: row.accessibility,
          lcpMs: row.lcpMs,
          cls: row.cls,
          passed: row.passed,
        }),
      );
    }
  completed = true;
} finally {
  await new Promise((resolve) => server.close(resolve));
  await writeFile(
    ".docs/phase0/" + evidence,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        completed,
        lighthouseVersion: packageInfo.version,
        build,
        presets,
        routes,
        scope:
          "Isolated loopback static production build, gzip-negotiated HTML/JS/CSS/JSON/SVG, anonymous allowlisted reads to local API only; HTTPS requests blocked, no account or writes/provider sends. Lighthouse default simulated mobile and desktop presets; measurements must run without competing browser/build/coverage load. Compression models a required hosting delivery setting, not evidence that it is deployed. Lab LCP/CLS/TBT and accessibility only; TBT is not INP and these runs do not certify field p75 INP/LCP, representative 3D hardware or hosted latency. Raw reports in ignored artifacts/performance.",
        tests,
      },
      null,
      2,
    ) + "\n",
  );
}
if (tests.some((test) => !test.passed)) process.exitCode = 1;
