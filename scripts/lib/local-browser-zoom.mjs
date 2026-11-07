import { chromium } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

// The tabs API changes Chrome's actual browser zoom in automatic mode. This
// does not resize the CSS viewport manually, use CSS zoom or pinch emulation.
// The extension and profile belong solely to this invocation, never the user's
// browser. No remote code or extension store is used.
export async function localBrowserZoom(width, height) {
  const scratch = await mkdtemp(path.join(tmpdir(), "gdg-owned-browser-zoom-")),
    extension = path.join(scratch, "extension");
  let context;
  try {
    await mkdir(extension);
    await writeFile(path.join(extension, "manifest.json"), JSON.stringify({ manifest_version: 3, name: "Owned local zoom verification", version: "1.0", permissions: ["tabs"], background: { service_worker: "background.js" } }));
    await writeFile(path.join(extension, "background.js"), "chrome.runtime.onInstalled.addListener(() => {});\n");
    context = await chromium.launchPersistentContext(path.join(scratch, "profile"), {
      channel: "chromium", headless: true, viewport: null,
      reducedMotion: "reduce", serviceWorkers: "allow",
      args: [`--window-size=${width},${height}`, "--disable-extensions-except=" + extension, "--load-extension=" + extension],
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    return {
      context,
      async setZoom(page, zoom) {
        const url = new URL(page.url());
        if (url.origin !== "http://127.0.0.1:8080" || ![1, 2].includes(zoom)) throw Error("Zoom probe is restricted to its owned loopback pages and reviewed factors.");
        return worker.evaluate(async ({ target, factor }) => {
          const tabs = await chrome.tabs.query({});
          const tab = tabs.find((candidate) => candidate.url === target);
          if (!tab) throw Error("Owned local tab was not found.");
          await chrome.tabs.setZoomSettings(tab.id, { mode: "automatic", scope: "per-tab" });
          await chrome.tabs.setZoom(tab.id, factor);
          return chrome.tabs.getZoom(tab.id);
        }, { target: page.url(), factor: zoom });
      },
      async close() { await context.close(); await rm(scratch, { recursive: true, force: true }); },
    };
  } catch (error) {
    await context?.close(); await rm(scratch, { recursive: true, force: true }); throw error;
  }
}
