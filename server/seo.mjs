import { ApiError, allowMethod } from "./lib/http.mjs";
import { databaseResult as checked } from "./lib/validation.mjs";
import { publicIndexPaths } from "../shared/public-metadata.ts";
const xml = (value) =>
  String(value).replace(
    /[<>&"']/g,
    (char) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[char],
  );
export async function seoRoutes(request, response, { db, config }) {
  const path = new URL(request.url, config.origin).pathname;
  if (
    !["/api/v1/public/sitemap.xml", "/api/v1/public/robots.txt"].includes(path)
  )
    return false;
  allowMethod(request, response, ["GET", "HEAD"]);
  response.setHeader(
    "Cache-Control",
    "public, max-age=0, s-maxage=60, stale-while-revalidate=60",
  );
  if (path.endsWith("robots.txt")) {
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.end(
      request.method === "HEAD"
        ? undefined
        : `# Georgia Tech GDG\nUser-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /account/\nDisallow: /newsletter/\nDisallow: /offline\nDisallow: /maintenance\nSitemap: ${config.origin}/sitemap.xml\n`,
    );
    return true;
  }
  const entries = publicIndexPaths.map((path) => ({
    loc: config.origin + path,
  }));
  for (let offset = 0; ; offset += 1000) {
    const rows = checked(
      await db
        .from("events")
        .select("slug,updated_at")
        .eq("publication_status", "published")
        .order("id")
        .range(offset, offset + 999),
    );
    for (const row of rows)
      if (
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug) &&
        row.slug.length <= 150
      ) {
        const updated = Date.parse(row.updated_at);
        entries.push({
          loc: config.origin + "/events/" + row.slug,
          ...(Number.isFinite(updated)
            ? { lastmod: new Date(updated).toISOString() }
            : {}),
        });
      }
    if (entries.length > 49999 || (offset >= 49000 && rows.length === 1000))
      throw new ApiError(
        503,
        "TEMPORARILY_UNAVAILABLE",
        "The sitemap requires a partitioned rebuild.",
      );
    if (rows.length < 1000) break;
  }
  // Forms and private/profile capability workflows are deliberately not discovered.
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    entries
      .map(
        (row) =>
          "<url><loc>" +
          xml(row.loc) +
          "</loc>" +
          (row.lastmod ? "<lastmod>" + xml(row.lastmod) + "</lastmod>" : "") +
          "</url>",
      )
      .join("") +
    "</urlset>\n";
  if (Buffer.byteLength(body) > 3 * 1024 * 1024)
    throw new ApiError(
      503,
      "TEMPORARILY_UNAVAILABLE",
      "The sitemap requires a partitioned rebuild.",
    );
  response.setHeader("Content-Type", "application/xml; charset=utf-8");
  response.end(request.method === "HEAD" ? undefined : body);
  return true;
}
