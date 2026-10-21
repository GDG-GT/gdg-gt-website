const publicPages = new Set(["/", "/events", "/team", "/gallery", "/resources", "/sponsors", "/contact", "/privacy", "/accessibility", "/offline", "/maintenance"]);
export function publicNavigationFallback(raw, origin) {
  try {
    const u = new URL(raw, origin);
    return u.origin === origin && !u.search && !u.hash && (publicPages.has(u.pathname) || /^\/events\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(u.pathname));
  } catch { return false; }
}
export function approvedPrecacheAsset(raw, origin) {
  try {
    const u = new URL(raw, origin);
    if (u.origin !== origin || u.search || u.hash) return false;
    return ["/index.html", "/offline.html", "/manifest.json", "/favicon.png", "/logo.png"].includes(u.pathname)
      || /^\/icons\/pwa-(192|512|maskable-512|apple-180)\.png$/.test(u.pathname)
      || /^\/assets\/[A-Za-z0-9_.-]+\.(js|css|woff2)$/.test(u.pathname);
  } catch { return false; }
}
