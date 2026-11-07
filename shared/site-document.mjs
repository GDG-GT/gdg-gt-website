const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
export function renderSiteDocument(template, document, rendered) {
  if (
    !/<\/head>/i.test(template) ||
    !/<div\s+id=["']root["']\s*>\s*<\/div>/i.test(template)
  )
    throw new Error("Invalid document template");
  const meta = document;
  // Replace the known template metadata, never interpolate into JS or attributes
  // without encoding. Values came only from published public projections.
  let html = template
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(
      /<meta\b[^>]*(?:name=["'](?:description|robots|twitter:[^"']*)["']|property=["']og:[^"']*["'])[^>]*>/gi,
      "",
    )
    .replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, "");
  const head = `<title>${escape(meta.title)}</title><meta name="description" content="${escape(meta.description)}"><meta name="robots" content="${meta.index ? "index, follow" : "noindex, nofollow, noarchive"}"><link rel="canonical" href="${escape(meta.canonical)}"><meta property="og:type" content="${meta.event ? "article" : "website"}"><meta property="og:title" content="${escape(meta.title)}"><meta property="og:description" content="${escape(meta.description)}"><meta property="og:url" content="${escape(meta.canonical)}"><meta property="og:image" content="${escape(meta.image)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(meta.title)}"><meta name="twitter:description" content="${escape(meta.description)}"><meta name="twitter:image" content="${escape(meta.image)}">`;
  html = html.replace(
    /<\/head>/i,
    () => head +
      (meta.structuredData
        ? `<script type="application/ld+json" data-gdg-document>${JSON.stringify(meta.structuredData).replace(/</g, "\\u003c").replace(/>/g, "\\u003e")}</script>`
        : "") +
      "</head>",
  );
  if (rendered) {
    if (!["/", "/events", "/contact"].includes(rendered.path) || typeof rendered.markup !== "string" || !rendered.bootstrap) throw Error("Invalid public render result");
    const data = JSON.stringify(rendered.bootstrap).replace(/[<>&\u2028\u2029]/g, (character) => "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0"));
    html = html.replace(/<link\b[^>]*href=["']\/api\/v1\/(?:site-status|public\/home)["'][^>]*>/gi, "");
    // Public markup is already complete. A bounded external loader lets it
    // paint before framework work; existing CSS/font requests remain immediate.
    const entry = /<script\b(?=[^>]*type="module")(?=[^>]*src="(\/assets\/[A-Za-z0-9_.-]+\.js)")[^>]*><\/script>/g;
    const entries = [...html.matchAll(entry)];
    if (entries.length !== 1 || entries[0][1].includes("..")) throw Error("Public hydration requires exactly one safe application entry.");
    html = html.replace(entry, () => `<script defer src="/assets/public-hydrate.js" data-entry="${escape(entries[0][1])}"></script>`)
      .replace(/<link\b(?=[^>]*rel="modulepreload")[^>]*>/g, "")
      .replace(/<script\b[^>]*src=["']\/assets\/public-entry\.js["'][^>]*><\/script>/i, "");
    return html.replace(/<div\s+id=["']root["']\s*>\s*<\/div>/i,
      () => `<div id="root" data-gdg-ssr="${escape(rendered.path)}">${rendered.markup}</div><script id="gdg-public-bootstrap" type="application/json">${data}</script>`);
  }
  const body = `<main id="server-content" class="gt-container gt-route-loading"><h1>${escape(meta.heading)}</h1><p>${escape(meta.body || meta.description)}</p>${meta.event ? `<p>${escape(meta.event.when)} · ${escape(meta.event.location)}</p>` : ""}<nav aria-label="Chapter pages">${(meta.links || []).map((link) => `<a href="${escape(link.href)}">${escape(link.label)}</a>`).join(" · ")}</nav></main>`;
  return html.replace(
    /<div\s+id=["']root["']\s*>\s*<\/div>/i,
    () => `<div id="root">${body}</div>`,
  );
}
