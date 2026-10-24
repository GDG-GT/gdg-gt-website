const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
export function renderSiteDocument(template, document) {
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
    head +
      (meta.structuredData
        ? `<script type="application/ld+json" data-gdg-document>${JSON.stringify(meta.structuredData).replace(/</g, "\\u003c").replace(/>/g, "\\u003e")}</script>`
        : "") +
      "</head>",
  );
  const body = `<main id="server-content" class="gt-container gt-route-loading"><h1>${escape(meta.heading)}</h1><p>${escape(meta.body || meta.description)}</p>${meta.event ? `<p>${escape(meta.event.when)} · ${escape(meta.event.location)}</p>` : ""}<nav aria-label="Chapter pages">${(meta.links || []).map((link) => `<a href="${escape(link.href)}">${escape(link.label)}</a>`).join(" · ")}</nav></main>`;
  return html.replace(
    /<div\s+id=["']root["']\s*>\s*<\/div>/i,
    `<div id="root">${body}</div>`,
  );
}
