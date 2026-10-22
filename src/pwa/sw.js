import { PrecacheController } from "workbox-precaching";
import {
  approvedPrecacheAsset,
  publicNavigationFallback,
} from "../../shared/pwa-policy.mjs";
import { publicQueue } from "../../shared/public-queue.mjs";
import { pushNotification, canonicalPushClick } from "../../shared/push-policy.mjs";
const origin = self.location.origin;
const precache = new PrecacheController({
  cacheName: "gdg-gt-public-assets-v1",
  plugins: [
    {
      requestWillFetch: async ({ request }) =>
        new Request(request, { credentials: "omit", redirect: "error" }),
      cacheWillUpdate: async ({ response }) =>
        response.status === 200 && !response.headers.has("set-cookie")
          ? response
          : null,
    },
  ],
});
const entries = self.__WB_MANIFEST.filter((entry) =>
  approvedPrecacheAsset(typeof entry === "string" ? entry : entry.url, origin),
);
precache.addToCacheList(entries);
const assetPaths = new Set(
  entries.map(
    (entry) =>
      new URL(typeof entry === "string" ? entry : entry.url, origin).pathname,
  ),
);
self.addEventListener("install", (event) =>
  event.waitUntil(precache.install(event)),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    Promise.all([
      precache.activate(event),
      publicQueue.replay().catch(() => {}),
    ]),
  ),
);
self.addEventListener("message", (event) => {
  // A waiting build is activated only by an explicit, draft-guarded UI action.
  if (event.data?.type === "GDG_ACTIVATE_UPDATE")
    event.waitUntil(self.skipWaiting());
  if (event.data?.type === "GDG_REPLAY_PUBLIC_QUEUE")
    event.waitUntil(publicQueue.replay().catch(() => {}));
});
self.addEventListener("fetch", (event) => {
  const { request } = event,
    url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== origin ||
    url.search ||
    url.hash
  )
    return;
  // No API, form, admin, signed-storage, private HTML or runtime data cache.
  if (assetPaths.has(url.pathname) && url.pathname !== "/index.html") {
    event.respondWith(
      precache
        .matchPrecache(request.url)
        .then((cached) => cached || fetch(request)),
    );
  } else if (
    request.mode === "navigate" &&
    publicNavigationFallback(request.url, origin)
  ) {
    event.respondWith(
      fetch(request).catch(
        async () =>
          (await precache.matchPrecache("/offline.html")) || Response.error(),
      ),
    );
  }
});
self.addEventListener("push", (event) => {
  let value;
  try {
    value = event.data?.json();
  } catch {
    return;
  }
  const notification = pushNotification(value, origin);
  if (notification)
    event.waitUntil(
      self.registration.showNotification(
        notification.title,
        notification.options,
      ),
    );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = canonicalPushClick(event.notification.data?.url, origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Do not navigate a dirty private tab away from its work.
      const exact = windows.find((client) => client.url === url);
      if (exact) return exact.focus();
      return self.clients.openWindow(url);
    })(),
  );
});
