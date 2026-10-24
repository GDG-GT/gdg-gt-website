import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localHttp } from "./lib/local-http.mjs";
const { env, db } = await localHttp(),
  tests = [],
  ids = [],
  suffix = randomUUID().slice(0, 8),
  slug = "fictional-document-" + suffix;
const check = (value, name) => {
  if (!value) throw Error("FAIL " + name);
  tests.push({ name, passed: true });
  console.info("PASS " + name);
};
const checked = (result) => {
  if (result.error) throw Error("Fixture failure " + result.error.code);
  return result.data;
};
async function html(path, options = {}) {
  const response = await fetch(env.APP_ORIGIN + path, {
    headers: { Accept: "text/html" },
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
    ...options,
  });
  return { response, body: await response.text() };
}
try {
  let r = await html("/resources?page=2&q=cloud");
  check(
    r.response.status === 200 &&
      r.body.includes("<title>Resources · GDG at Georgia Tech</title>") &&
      r.body.includes('href="' + env.APP_ORIGIN + '/resources"') &&
      !r.body.includes(
        'rel="canonical" href="' + env.APP_ORIGIN + "/resources?",
      ),
    "raw route HTML has a unique title and query-free canonical before JavaScript",
  );
  check(
    r.body.includes('id="server-content"') &&
      r.body.includes('aria-label="Chapter pages"') &&
      r.body.includes('type="module"'),
    "crawler/no-script content and the real application module coexist",
  );
  r = await html("/fictional-missing-" + suffix);
  check(
    r.response.status === 404 &&
      r.body.includes("Page not found") &&
      r.response.headers.get("x-robots-tag").includes("noindex"),
    "unknown routes return real HTML 404 and noindex",
  );
  r = await html("/admin/content?mode=preview&page=home");
  check(
    r.response.status === 200 &&
      r.response.headers.get("cache-control") === "no-store" &&
      r.response.headers.get("x-robots-tag").includes("noindex") &&
      !r.body.includes("Saved drafts"),
    "private workflow HTML is generic, uncached and noindex",
  );
  for (const path of ["/blog", "/projects"]) {
    r = await html(path);
    check(
      r.response.status === 404,
      "retired " + path + " remains an HTTP 404",
    );
  }
  const id = randomUUID();
  ids.push(id);
  checked(
    await db
      .from("events")
      .insert({
        id,
        slug,
        title: "Fictional public document " + suffix,
        short_description:
          "Fictional event description for local read-path verification.",
        description: "Fictional event description.",
        start_at: "2026-11-10T18:00:00Z",
        end_at: "2026-11-10T20:00:00Z",
        timezone: "America/New_York",
        location: "Fictional test venue",
        publication_status: "published",
        published_at: new Date().toISOString(),
        registration_enabled: false,
      }),
  );
  r = await html("/events/" + slug);
  check(
    r.response.status === 200 &&
      r.body.includes("Fictional public document " + suffix) &&
      r.body.includes('property="og:description"') &&
      r.body.includes('"@type":"Event"') &&
      r.body.includes("Fictional test venue"),
    "published event raw HTML includes current social metadata and factual Event data",
  );
  const head = await html("/events/" + slug, { method: "HEAD" });
  check(
    head.response.status === 200 &&
      head.body === "" &&
      head.response.headers.get("content-type").includes("text/html"),
    "HTML HEAD matches document status without a body",
  );
  const alias = "fictional-old-document-" + suffix;
  checked(
    await db
      .from("event_slug_redirects")
      .insert({ old_slug: alias, event_id: id }),
  );
  r = await html("/events/" + alias);
  check(
    r.response.status === 308 &&
      r.response.headers.get("location") === "/events/" + slug,
    "old event slug redirects only to its published canonical event",
  );
  checked(
    await db
      .from("events")
      .update({ publication_status: "archived" })
      .eq("id", id),
  );
  r = await html("/events/" + slug);
  check(
    r.response.status === 404 &&
      !r.body.includes("Fictional public document " + suffix),
    "archived event metadata disappears from documents immediately",
  );
  r = await html("/events/" + alias);
  check(
    r.response.status === 404 && !r.response.headers.get("location"),
    "old slug stops redirecting once its event is private",
  );
} finally {
  if (ids.length)
    checked(
      await db
        .from("events")
        .update({ publication_status: "archived" })
        .in("id", ids),
    );
}
await writeFile(
  new URL("../.docs/phase0/local-public-documents.json", import.meta.url),
  JSON.stringify(
    {
      note: "Actual loopback raw HTML/HEAD/status/header checks. Only invocation-owned fictional read-path events created then recoverably archived; not admin publication or hosted deployment evidence.",
      tests,
    },
    null,
    2,
  ) + "\n",
);
