import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
let idle: (() => void) | undefined;
function fixture(complete = false) {
  const worker = { waiting: undefined, addEventListener: vi.fn() };
  const register = vi.fn(async () => worker);
  const surface = Object.assign(new EventTarget(), { isSecureContext: true,
    requestIdleCallback: vi.fn((callback: () => void) => { idle = callback; }),
  });
  vi.stubGlobal("window", surface);
  vi.stubGlobal("document", { readyState: complete ? "complete" : "loading" });
  vi.stubGlobal("navigator", { serviceWorker: { register, ready: new Promise(() => {}) } });
  return { surface, register };
}
beforeEach(() => { vi.resetModules(); vi.stubEnv("PROD", true); idle = undefined; });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("first-visit offline installation", () => {
  it("keeps installation out of the document loading path", async () => {
    const f = fixture();
    const { registerPublicWorker } = await import("../../src/pwa/register");
    const pending = registerPublicWorker();
    await Promise.resolve(); expect(f.register).not.toHaveBeenCalled(); expect(idle).toBeUndefined();
    f.surface.dispatchEvent(new Event("load")); await Promise.resolve();
    expect(f.surface.requestIdleCallback).toHaveBeenCalled(); expect(f.register).not.toHaveBeenCalled();
    idle!(); await pending;
    expect(f.register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
  });
  it("does not miss registration when the document already loaded", async () => {
    const f = fixture(true), { registerPublicWorker } = await import("../../src/pwa/register");
    const pending = registerPublicWorker(); expect(f.register).not.toHaveBeenCalled();
    idle!(); await pending; expect(f.register).toHaveBeenCalledOnce();
  });
  it("does not install on an insecure context", async () => {
    const f = fixture(true); f.surface.isSecureContext = false;
    const { registerPublicWorker } = await import("../../src/pwa/register"); await registerPublicWorker();
    expect(f.register).not.toHaveBeenCalled(); expect(idle).toBeUndefined();
  });
});
