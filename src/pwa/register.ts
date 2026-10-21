let registration: ServiceWorkerRegistration | undefined;
let ready = false;
export async function registerPublicWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator) || !window.isSecureContext) return;
  try {
    registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    const announce = () => { if (registration?.waiting) window.dispatchEvent(new Event("gdg:pwa-update")); };
    announce();
    registration.addEventListener("updatefound", () => {
      const worker = registration?.installing;
      worker?.addEventListener("statechange", () => { if (worker.state === "installed" && navigator.serviceWorker.controller) announce(); });
    });
    window.addEventListener("online", () => { void registration?.update().catch(() => {}); });
    void navigator.serviceWorker.ready.then(() => { ready = true; window.dispatchEvent(new Event("gdg:pwa-ready")); });
  } catch { window.dispatchEvent(new Event("gdg:pwa-unavailable")); }
}
export function hasWaitingUpdate() { return !!registration?.waiting; }
export function isPublicWorkerReady() { return ready; }
export function activatePublicUpdate() {
  if (!registration?.waiting) return;
  // Do not reload other tabs: their unsaved work belongs to their own UI.
  navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
  registration.waiting.postMessage({ type: "GDG_ACTIVATE_UPDATE" });
}
