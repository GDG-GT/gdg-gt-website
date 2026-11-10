import { lazy } from "react";

function stylesheetFailure(error: unknown): URL | undefined {
  if (typeof window === "undefined" || !(error instanceof Error)) return;
  const match = /^Unable to preload CSS for (.+)$/.exec(error.message);
  if (!match) return;
  try {
    const url = new URL(match[1], window.location.origin);
    if (url.origin === window.location.origin && /^\/assets\/[A-Za-z0-9_.-]+\.css$/.test(url.pathname) && !url.search && !url.hash)
      return url;
  } catch { /* Unknown failures stay with the route error boundary. */ }
}

/** Retry only a failed static stylesheet; never reload a document or replay an API write. */
export async function loadRoute<T>(loader: () => Promise<T>): Promise<T> {
  try { return await loader(); }
  catch (error) {
    const url = stylesheetFailure(error);
    if (!url || !navigator.onLine) throw error;
    const response = await fetch(url.href, {
      cache: "reload", credentials: "omit", redirect: "error", signal: AbortSignal.timeout(8000),
    });
    if (!response.ok || !/^text\/css(?:;|$)/i.test(response.headers.get("content-type") || "")) {
      await response.body?.cancel();
      throw error;
    }
    // Consume the successful response to replace the browser's failed cache entry.
    await response.text();
    const previous = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).filter((link) => link.href === url.href);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    url.searchParams.set("gdg_asset_retry", String(Date.now()));
    link.href = url.href;
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => { link.remove(); reject(error); }, 8000);
      link.onload = () => { clearTimeout(timer); previous.forEach((old) => old.remove()); resolve(); };
      link.onerror = () => { clearTimeout(timer); link.remove(); reject(error); };
      document.head.appendChild(link);
    });
    return loader();
  }
}

export const lazyRoute: typeof lazy = (loader) => lazy(() => loadRoute(loader));

/** An explicit reload repairs cached asset failures without clearing session or form data. */
export async function refreshPageAssets() {
  const urls = new Set(Array.from(document.querySelectorAll<HTMLLinkElement | HTMLScriptElement>('link[rel="stylesheet"],link[rel="modulepreload"],script[src]'))
    .map((node) => new URL(node instanceof HTMLScriptElement ? node.src : node.href, window.location.origin))
    .filter((url) => url.origin === window.location.origin && /^\/assets\/[A-Za-z0-9_.-]+\.(?:css|js)$/.test(url.pathname) && !url.search && !url.hash)
    .map((url) => url.href));
  await Promise.allSettled(Array.from(urls, async (url) => {
    const response = await fetch(url, { cache: "reload", credentials: "omit", redirect: "error", signal: AbortSignal.timeout(8000) });
    if (response.ok) await response.text();
    else await response.body?.cancel();
  }));
}
