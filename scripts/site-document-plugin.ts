import type { Plugin } from "vite";
import { readFile } from "node:fs/promises";
import { renderSiteDocument } from "../shared/site-document.mjs";
export function siteDocuments(): Plugin {
  return {
    name: "gdg-public-documents",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (
          !["GET", "HEAD"].includes(request.method || "") ||
          !request.headers.accept?.includes("text/html")
        )
          return next();
        const url = new URL(request.url || "/", "http://127.0.0.1:8080"),
          pathname = url.pathname;
        if (
          /^\/(?:api(?:\/|$)|assets(?:\/|$)|src(?:\/|$)|icons(?:\/|$)|node_modules(?:\/|$)|@|sw\.js$|offline\.html$|manifest\.json$|(?:logo|favicon)\.|humans\.txt$|(?:sitemap|rss)\.xml$|robots\.txt$)/.test(
            pathname,
          )
        )
          return next();
        try {
          const result = await fetch(
            "http://127.0.0.1:8081/api/v1/public/document?" +
              new URLSearchParams({ path: pathname }),
            { signal: AbortSignal.timeout(10000) },
          );
          if (!result.ok) throw new Error("Document metadata unavailable");
          const doc = (
            (await result.json()) as {
              data: { status: number; redirect?: string; index: boolean };
            }
          ).data;
          response.statusCode = doc.status;
          response.setHeader("Cache-Control", "no-store");
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
          const template = await readFile(
              new URL("../index.html", import.meta.url),
              "utf8",
            ),
            html = await server.transformIndexHtml(
              request.url || "/",
              template,
            );
          response.end(
            request.method === "HEAD"
              ? undefined
              : renderSiteDocument(html, doc),
          );
        } catch {
          response.statusCode = 503;
          response.setHeader("Cache-Control", "no-store");
          response.setHeader("Retry-After", "30");
          response.end(
            request.method === "HEAD"
              ? undefined
              : "This page is temporarily unavailable. Please try again.",
          );
        }
      });
    },
  };
}
