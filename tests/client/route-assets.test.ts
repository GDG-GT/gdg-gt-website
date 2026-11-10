// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { loadRoute, refreshPageAssets } from "../../src/lib/route-assets";
afterEach(() => { document.head.innerHTML = ""; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("repairs a cached CSS failure once and retries the import without reloading", async () => {
  const href = new URL("/assets/gt-fictional.css", window.location.origin).href;
  const old = document.createElement("link"); old.rel = "stylesheet"; old.href = href; document.head.appendChild(old);
  const fetcher = vi.fn(async () => new Response(".fixture{display:block}", { headers: { "content-type": "text/css" } }));
  vi.stubGlobal("fetch", fetcher);
  const append = document.head.appendChild.bind(document.head);
  vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
    const result = append(node); queueMicrotask(() => node.dispatchEvent(new Event("load"))); return result;
  });
  const loader = vi.fn().mockRejectedValueOnce(Error("Unable to preload CSS for /assets/gt-fictional.css")).mockResolvedValue({ default: "Fictional component" });
  await expect(loadRoute(loader)).resolves.toEqual({ default: "Fictional component" });
  expect(loader).toHaveBeenCalledTimes(2);
  expect(fetcher).toHaveBeenCalledWith(href, expect.objectContaining({ cache: "reload", credentials: "omit", redirect: "error" }));
  expect(old.isConnected).toBe(false);
  expect(document.head.querySelector<HTMLLinkElement>("link")?.href).toContain("gdg_asset_retry=");
});
it.each(["text/plain", "text/html"])("does not import after an invalid %s stylesheet response", async (type) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { headers: { "content-type": type } })));
  const error = Error("Unable to preload CSS for /assets/gt-fictional.css"), loader = vi.fn().mockRejectedValue(error);
  await expect(loadRoute(loader)).rejects.toBe(error);
  expect(loader).toHaveBeenCalledTimes(1);
  expect(document.head.querySelector("link")).toBeNull();
});
it.each(["Fictional rendering error", "Unable to preload CSS for https://outside.example.org/assets/gt.css", "Unable to preload CSS for /api/v1/private.css"])("leaves unrelated/unsafe errors to the boundary (%s)", async (message) => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const error = Error(message); await expect(loadRoute(() => Promise.reject(error))).rejects.toBe(error);
  expect(fetcher).not.toHaveBeenCalled();
});
it("explicit recovery fetches static assets only and never API URLs", async () => {
  document.head.innerHTML = '<link rel="stylesheet" href="/assets/gt-test.css"><link rel="stylesheet" href="/api/v1/private"><link rel="stylesheet" href="https://outside.example.org/x.css"><script src="/assets/main-test.js"></script>';
  const fetcher = vi.fn(async () => new Response("fixture")); vi.stubGlobal("fetch", fetcher);
  await refreshPageAssets();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls.every(([url]) => String(url).includes("/assets/"))).toBe(true);
});
