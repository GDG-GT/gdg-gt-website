import { readPublicBootstrap } from "../server/public-bootstrap.mjs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { serverConfig } from "../server/config.mjs";
import { serverDatabase } from "../server/db/client.mjs";
import { siteDocument } from "../server/site-document.mjs";
import { renderSiteDocument } from "../shared/site-document.mjs";
import {
  publicRewardsOrigin,
  rewardsPagePaths,
} from "../shared/rewards-pages.mjs";
function documentFailure(error, phase) {
  console.error(
    JSON.stringify({
      event: "public_document_unavailable",
      phase,
      errorType: error?.name || "Error",
      dependencyCode: [
        "ERR_MODULE_NOT_FOUND",
        "MODULE_NOT_FOUND",
        "ENOENT",
        "ERR_UNKNOWN_FILE_EXTENSION",
        "ERR_PACKAGE_PATH_NOT_EXPORTED",
        "ERR_REQUIRE_ESM",
        "ERR_REQUIRE_ASYNC_MODULE",
        "ERR_UNSUPPORTED_DIR_IMPORT",
      ].includes(error?.code)
        ? error.code
        : "UNAVAILABLE",
      // Report only known dependency names, never arbitrary exception text/paths.
      dependency:
        [
          "react-dom",
          "react-router",
          "lucide-react",
          "react",
          "entry.mjs",
        ].find((name) =>
          new RegExp(
            `(?:[\\/\\"']|^)${name.replaceAll(".", "\\.")}(?:[\\/\\"']|$)`,
          ).test(String(error?.message || "")),
        ) || "UNAVAILABLE",
      fingerprint: createHash("sha256")
        .update(String(error?.message || ""))
        .digest("hex"),
    }),
  );
}
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
    let phase = "configuration";
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
      const hostname =
        request.headers.host === new URL(publicRewardsOrigin).host
          ? new URL(publicRewardsOrigin).hostname
          : new URL(config.origin).hostname;
      const rewardsPages = rewardsPagePaths(hostname);
      const db = databaseFactory();
      phase = "metadata";
      const doc = await siteDocument({
        db,
        config,
        pathname,
        hostname,
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
      if (
        ["/", "/events", "/contact"].includes(pathname) &&
        !publicQuery.size &&
        !(rewardsPages?.home === "/" && pathname === "/")
      ) {
        let renderer,
          unavailable = false;
        phase = "renderer-load";
        try {
          rendererReady ||= loadRenderer();
          renderer = await rendererReady;
        } catch (error) {
          documentFailure(error, phase);
          rendererReady = undefined;
          unavailable = true;
        }
        if (renderer || unavailable) {
          phase = "availability";
          const bootstrap = await loadBootstrap(db);
          if (!bootstrap.status.is_live) {
            response.statusCode = 302;
            response.setHeader(
              "Location",
              bootstrap.status.auto_redirect
                ? bootstrap.status.redirect_url
                : "/maintenance",
            );
            response.end();
            return;
          }
          if (renderer && request.method !== "HEAD") {
            phase = "public-render";
            try {
              rendered = {
                ...(await renderer.renderPublicPage(pathname, bootstrap)),
                path: pathname,
              };
            } catch (error) {
              // Fresh availability remains authoritative. A rendering failure
              // can use the existing client boundary without exposing partial
              // server markup or turning a live site into an empty error page.
              documentFailure(error, phase);
            }
          }
        }
      }
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.setHeader(
        "X-Robots-Tag",
        doc.index ? "index, follow" : "noindex, nofollow, noarchive",
      );
      phase = "template";
      template ||= await loadTemplate();
      phase = "document";
      response.end(
        request.method === "HEAD"
          ? undefined
          : renderSiteDocument(template, doc, rendered),
      );
    } catch (error) {
      documentFailure(error, phase);
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
