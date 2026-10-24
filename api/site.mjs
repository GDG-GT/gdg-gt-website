import { readFile } from "node:fs/promises";
import { serverConfig } from "../server/config.mjs";
import { serverDatabase } from "../server/db/client.mjs";
import { siteDocument } from "../server/site-document.mjs";
import { renderSiteDocument } from "../shared/site-document.mjs";
export function createSiteDocumentHandler({
  configFactory = serverConfig,
  databaseFactory = serverDatabase,
  loadTemplate = () =>
    readFile(new URL("../dist/index.html", import.meta.url), "utf8"),
} = {}) {
  let template;
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
      const doc = await siteDocument({
        db: databaseFactory(),
        config,
        pathname,
      });
      response.statusCode = doc.status;
      if (doc.redirect) {
        response.setHeader("Location", doc.redirect);
        response.end();
        return;
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
          : renderSiteDocument(template, doc),
      );
    } catch {
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
