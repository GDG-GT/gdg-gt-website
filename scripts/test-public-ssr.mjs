import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { renderSiteDocument } from "../shared/site-document.mjs";
import { createSiteDocumentHandler } from "../api/site.mjs";
const tests = [], check = (value, name) => { if (!value) throw Error(name); tests.push({ name, passed: true }); console.info("PASS " + name); };
if (process.env.NODE_ENV !== "production") throw Error("Run the artifact probe with NODE_ENV=production.");
const originalFetch = globalThis.fetch;
let network = 0;
globalThis.fetch = async () => { network++; throw Error("Render-time network is forbidden in this fictional artifact probe."); };
const renderer = await import("../.build/ssr/entry.mjs");
const template = await readFile("dist/index.html", "utf8"), copy = "$& </script><img src=x onerror=fictional>";
const home = { settings: [], navigation: [], footer: [], social: [], metrics: [], sponsors: [], pages: [
  { page_slug: "home", section_key: "hero", content: { title: copy } },
  { page_slug: "events", section_key: "header", content: { title: "Fictional event heading", description: "Fictional event copy" } },
  { page_slug: "contact", section_key: "main", content: { title: "Fictional contact heading", description: "Fictional contact copy" } },
] };
const status = { revision: 1, is_live: true, message: "", redirect_url: "", button_text: "Chapter website", auto_redirect: false };
const metadata = { title: "Fictional $& title", description: "Fictional copy", index: true, canonical: "https://fictional.example.test/", image: "/logo.png", heading: "Fictional heading" };
try {
  for (const path of ["/", "/events", "/contact"]) {
    const result = await renderer.renderPublicPage(path, { home, status });
    check((result.markup.match(/<h1\b/g) || []).length === 1 && !/<script\b/i.test(result.markup), path + " renders one actual heading without inline execution");
    check(result.markup.includes("inert=\"\""), path + " keeps server-rendered forms inert before hydration");
    if (path === "/") check(result.markup.includes("gt-home-hero") && result.markup.includes("/assets/hero-atmosphere.webp"), "Home renders the real hero with parser-discoverable image sources");
    const html = renderSiteDocument(template, metadata, { ...result, path });
    check(html.includes('src="/assets/public-hydrate.js"') && !html.includes('rel="modulepreload"') && !html.includes('src="/assets/public-entry.js"'), path + " gives complete public markup a paint opportunity before framework startup");
    const data = JSON.parse(html.match(/<script id="gdg-public-bootstrap" type="application\/json">([\s\S]*?)<\/script>/)[1]);
    check(data.home.pages[0].content.title === copy && !html.includes("<img src=x") && html.includes("Fictional $&amp; title"), path + " escapes bootstrap data and preserves literal replacement tokens");
    check(!html.includes('href="/api/v1/public/home"') && !html.includes('href="/api/v1/site-status"'), path + " avoids redundant initial public API preloads");
  }
  check(network === 0, "public React rendering performs no network requests");
  await renderer.renderPublicPage("/admin", { home, status }).then(() => check(false, "private renderer path rejected"), () => check(true, "private renderer path rejected"));
  let reads = 0, renders = 0;
  const chain = { select: () => chain, eq: () => chain, is: () => chain, maybeSingle: async () => ({ data: null }) };
  const handler = createSiteDocumentHandler({ configFactory: () => ({ origin: "https://fictional.example.test" }), databaseFactory: () => ({ from: () => chain }),
    loadTemplate: async () => template,
    loadBootstrap: async () => { reads++; return { home, status }; },
    loadRenderer: async () => ({ renderPublicPage: async (...args) => { renders++; return renderer.renderPublicPage(...args); } }),
  });
  async function call(url, method = "GET") {
    const response = { statusCode: 200, headers: new Map(), setHeader(name, value) { this.headers.set(name.toLowerCase(), value); }, end(value) { this.body = value; } };
    await handler({ url, method, headers: { host: "untrusted.example.test" } }, response); return response;
  }
  let r = await call("/"); check(r.statusCode === 200 && r.body.includes('data-gdg-ssr="/"') && r.headers.get("cache-control") === "no-store", "production handler renders fresh public HTML without shared caching");
  r = await call("/events?__route=/events&route=events"); check(r.statusCode === 200 && r.body.includes('data-gdg-ssr="/events"'), "host-provided named rewrite capture retains complete public rendering");
  const before = reads;
  for (const path of ["/admin", "/forms/fictional", "/contact?type=membership"]) { r = await call(path); check(r.statusCode === 200 && !r.body.includes("gdg-public-bootstrap") && reads === before, path + " preserves its ordinary client/private boundary"); }
  const renderedBeforeHead = renders; r = await call("/", "HEAD"); check(r.body === undefined && renders === renderedBeforeHead, "HEAD checks availability without rendering an HTML body");
  status.is_live = false; status.message = "Fictional maintenance"; r = await call("/"); check(r.statusCode === 302 && r.headers.get("location") === "/maintenance" && !r.body, "known maintenance redirects before public controls are served");
  status.auto_redirect = true; status.redirect_url = "/l/fictional"; r = await call("/"); check(r.statusCode === 302 && r.headers.get("location") === "/l/fictional", "approved maintenance destination remains effective");
} finally { globalThis.fetch = originalFetch; }
await writeFile(".docs/phase0/public-ssr-artifact.json", JSON.stringify({ generatedAt: new Date().toISOString(), scope: "Production-mode compiled React renderer with fictional public snapshots, no network, database writes or provider calls. Not browser hydration or hosted acceptance.", rendererSha256: createHash("sha256").update(await readFile(".build/ssr/entry.mjs")).digest("hex"), tests }, null, 2) + "\n");
