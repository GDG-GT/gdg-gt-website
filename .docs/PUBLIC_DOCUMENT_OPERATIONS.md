# Public HTML, crawler metadata and genuine 404 responses

Local checkpoint, 2026-10-24. No hosted deployment or crawler-platform submission
has been performed.

The document handler serves the production Vite shell with route-specific title,
description, canonical, Open Graph and Twitter tags before JavaScript. A minimal
escaped heading/body/navigation fallback is included for no-script/crawler access;
React replaces it with the application. This is not full React server rendering.

Only active, nondeleted curated public CMS fields and published event fields are
read. Event HTML includes factual Event data, date and location; no invented
prices or address. An old slug redirects only to its currently published event.
Missing/archived events, retired public Blog/Projects and unknown routes return
HTML 404 with noindex. Private admin, account, token and Forms routes get generic,
uncached noindex HTML with no token/identity lookup. Forms remain outside sitemap
discovery. Public Linktree content uses its existing safe active-profile projection
and stays noindex. Canonicals use configured `APP_ORIGIN`, never request Host.

`api/site.mjs` reads the built `dist/index.html` included in the function bundle.
Vercel routing sends document paths there while retaining API/static/PWA routes.
The Vite plugin exercises the same document projection/rendering locally through
the loopback versioned API, while preserving Vite HTML transforms and module
startup. The public metadata transport is no-store and not a private API.

Missing metadata/database/build artifacts fail with a redacted retryable 503.
HTML values and JSON-LD are encoded independently. React removes the initial
document graph before route components own the live graph, preventing duplicate
Organization/Event data. No response includes private source maps or credentials.

Eleven actual local raw-HTML/HEAD/status/header checks pass, including published
event metadata, real 404s, old-slug redirect and immediate archive concealment.
Only invocation-owned fictional read-path events were created, then recoverably
archived. This is not admin-publication or hosted-provider evidence. Sixteen
document/sitemap unit cases cover production-handler status, Host poisoning,
escaping, generic private shells, safe public projections and provider failure.

Use `npm run test:local-documents` and `npm run test:local-seo` with the real local
API. Production build and byte checks remain separate. Hosted rewrite precedence,
function asset inclusion, canonical-domain redirects, CSP rollout, crawler/social
preview checks and real-device/no-script presentation still require staging.

Implementation references: [Vercel rewrites](https://vercel.com/docs/routing/rewrites),
[function includeFiles](https://vercel.com/docs/project-configuration/vercel-json#functions),
[Vite configureServer](https://vite.dev/guide/api-plugin.html#configureserver),
and [Google JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).
