import { readPublicBootstrap } from "../server/public-bootstrap.mjs";
import { readFile } from "node:fs/promises";
import { serverConfig } from "../server/config.mjs";
import { serverDatabase } from "../server/db/client.mjs";
import { siteDocument } from "../server/site-document.mjs";
import { renderSiteDocument } from "../shared/site-document.mjs";
export function createSiteDocumentHandler({
  configFactory = serverConfig,
  databaseFactory = serverDatabase,
  // A literal import lets the host trace the renderer's runtime dependencies.
  loadRenderer = () => import("../.build/ssr/entry.mjs"),
  loadBootstrap = readPublicBootstrap,
  loadTemplate = () =>
    readFile(new URL("../dist/index.html", import.meta.url), "utf8"),
} = {}) {
  let template;
  let rendererReady;
  return async function handler(request, response) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (!["GET", "HEAD"].includes(request.method)) {
      response.setHeader("Allow", "GET, HEAD");
      response.statusCode = 405;
      response.end();
      return;
    }
    try {
      const config = configFactory(),
        url = new URL(request.url, config.origin),
        paths = url.searchParams.getAll("__route");
      if (paths.length > 1) {
        response.statusCode = 400;
        response.end();
        return;
      }
      const pathname =
        url.pathname === "/api/site" ? paths[0] || "/" : url.pathname;
      const db = databaseFactory();
      const doc = await siteDocument({
        db,
        config,
        pathname,
      });
      response.statusCode = doc.status;
      if (doc.redirect) {
        response.setHeader("Location", doc.redirect);
        response.end();
        return;
      }
      let rendered;
      const publicQuery = new URLSearchParams(url.searchParams);
      publicQuery.delete("__route");
      // Vercel forwards its named rewrite capture as a query argument too.
      if (publicQuery.get("route") === pathname.replace(/^\//, ""))
        publicQuery.delete("route");
      if (["/", "/events", "/contact"].includes(pathname) && !publicQuery.size) {
        rendererReady ||= loadRenderer();
        const renderer = await rendererReady;
        if (renderer) {
          const bootstrap = await loadBootstrap(db);
          if (!bootstrap.status.is_live) {
            response.statusCode = 302;
            response.setHeader("Location", bootstrap.status.auto_redirect ? bootstrap.status.redirect_url : "/maintenance");
            response.end(); return;
          }
          if (request.method !== "HEAD") rendered = { ...await renderer.renderPublicPage(pathname, bootstrap), path: pathname };
        }
      }
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.setHeader(
        "X-Robots-Tag",
        doc.index ? "index, follow" : "noindex, nofollow, noarchive",
      );
      template ||= await loadTemplate();
      response.end(
        request.method === "HEAD"
          ? undefined
          : renderSiteDocument(template, doc, rendered),
      );
    } catch (error) {
      console.error(JSON.stringify({
        event: "public_document_unavailable",
        errorType: error?.name || "Error",
        dependencyCode: ["ERR_MODULE_NOT_FOUND", "ENOENT", "ERR_UNKNOWN_FILE_EXTENSION"].includes(error?.code) ? error.code : "UNAVAILABLE",
      }));
      response.statusCode = 503;
      response.setHeader("Retry-After", "30");
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      response.end(
        request.method === "HEAD"
          ? undefined
          : "This page is temporarily unavailable. Please try again.",
      );
    }
  };
}
export default createSiteDocumentHandler();
