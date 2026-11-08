import { writeFile } from "node:fs/promises";

// Read-only checks of the owner's actual canonical host after a deployment.
// No credentials, private accounts, mutations, provider sends or response bodies
// are retained. Local fixture tests remain separate from hosted acceptance.
const args = process.argv.slice(2);
if (args.length) throw Error("This probe only checks the configured canonical gdggt.dev host.");
const origin = "https://gdggt.dev", checks = [];
const check = (passed, name) => {
  checks.push({ name, passed: !!passed });
  console.info((passed ? "PASS " : "FAIL ") + name);
};
async function get(path) {
  const response = await fetch(origin + path, {
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
    headers: { "User-Agent": "GDG-hosted-readiness/1.0" },
  });
  const body = await response.text();
  return { response, body, json: () => JSON.parse(body) };
}
let completed = false;
try {
  for (const path of ["/", "/events", "/contact"]) {
    const { response: r, body } = await get(path);
    check(r.status === 200 && r.headers.get("content-type")?.includes("text/html"), path + " serves successful HTML over verified HTTPS");
    check(body.includes(`data-gdg-ssr="${path}"`) && (body.match(/<h1\b/g) || []).length === 1, path + " serves actual public content before JavaScript");
    check(body.includes('src="/assets/public-hydrate.js"') && body.includes('id="gdg-public-bootstrap"'), path + " includes the public hydration boundary");
    check(r.headers.get("cache-control")?.includes("no-store"), path + " prevents shared caching of current public availability");
    const csp = r.headers.get("content-security-policy") || "";
    check(csp.includes("script-src 'self'") && !csp.includes("'unsafe-eval'") && r.headers.get("x-content-type-options") === "nosniff", path + " retains the executable-content and MIME policy");
    check(body.includes('href="https://gdggt.dev' + (path === "/" ? "/" : path) + '"'), path + " advertises the owner's canonical domain");
  }
  for (const path of ["/admin", "/forms/not-a-real-hosted-form", "/contact?type=membership"]) {
    const { response: r, body } = await get(path);
    check(r.status === 200 && !body.includes("gdg-public-bootstrap") && r.headers.get("cache-control")?.includes("no-store"), path + " preserves the ordinary private/query client boundary");
  }
  for (const path of ["/api/v1/health", "/api/v1/site-status", "/api/v1/public/home"]) {
    const r = await get(path);
    check(r.response.status === 200 && r.response.headers.get("content-type")?.includes("application/json") && !!r.json().data, path + " reaches the deployed versioned API");
    check(r.response.headers.get("cache-control")?.includes(path === "/api/v1/public/home" ? "must-revalidate" : "no-store"), path + " retains its declared public/private cache policy");
  }
  const session = await get("/api/v1/auth/session");
  check(session.response.status === 401 && session.json().error?.code === "AUTH_REQUIRED", "nested session route rejects anonymous access through the deployed adapter");
  const unknown = await get("/api/v1/not-a-real-endpoint");
  check(unknown.response.status === 404 && unknown.response.headers.get("content-type")?.includes("application/json"), "unknown versioned route returns a structured API 404");
  for (const path of ["/.env.server.local", "/.docs/local-auth.local", "/.build/ssr/entry.mjs"]) {
    const { response: r, body } = await get(path);
    check(r.status === 404 && !body.includes("SUPABASE_SECRET_KEY=") && !body.includes("export function"), path + " cannot expose server-only files");
  }
  const manifest = await get("/manifest.json");
  check(manifest.response.status === 200 && manifest.json().start_url === "/", "canonical manifest is available");
  const worker = await get("/sw.js");
  check(worker.response.status === 200 && worker.response.headers.get("cache-control")?.includes("no-store") && worker.response.headers.get("service-worker-allowed") === "/", "service worker preserves update and scope headers");
  completed = checks.every((r) => r.passed);
} catch (error) {
  checks.push({ name: "Hosted response processing completed", passed: false, errorType: error.name });
} finally {
  await writeFile(".docs/phase0/hosted-readiness.json", JSON.stringify({ generatedAt: new Date().toISOString(), origin, completed, checks, scope: "Real canonical HTTPS host, read-only requests, no credentials/private records/provider sends/response bodies retained. Does not prove owner sign-in, file workers, physical-device push, live delivery, restore or 48-hour acceptance." }, null, 2) + "\n");
}
if (!completed) process.exitCode = 1;
