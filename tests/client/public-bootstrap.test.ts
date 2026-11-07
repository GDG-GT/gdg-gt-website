// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { readPublicBootstrap } from "../../src/ui/public-hydration";
const home = { settings: [], pages: [], navigation: [], social: [], footer: [], metrics: [], sponsors: [] };
const status = { revision: 1, is_live: true, message: "", redirect_url: "", button_text: "Chapter updates", auto_redirect: false };
function mount(raw: unknown, path = location.pathname + location.search) {
  const root = document.createElement("div"); root.id = "root"; root.setAttribute("data-gdg-ssr", path);
  const script = document.createElement("script"); script.id = "gdg-public-bootstrap"; script.type = "application/json"; script.textContent = JSON.stringify(raw);
  document.body.replaceChildren(root, script); return script;
}
afterEach(() => document.body.replaceChildren());
describe("public document bootstrap boundary", () => {
  it("reads public content and availability without accepting a browser actor", () => {
    mount({ home, status, user: { role: "super_admin", id: "fictional-forged-actor" } });
    expect(readPublicBootstrap()).toEqual({ home, status });
    expect(readPublicBootstrap()).not.toHaveProperty("user");
  });
  it("does not reuse a snapshot on a different route", () => {
    mount({ home, status }, "/admin"); expect(readPublicBootstrap()).toBeUndefined();
  });
  it("rejects malformed content and any non-public availability fields", () => {
    for (const raw of [{ home: null, status }, { home, status: { ...status, actor: "fictional" } }, { home, status: { ...status, is_live: "true" } }]) {
      mount(raw); expect(readPublicBootstrap()).toBeUndefined();
    }
  });
  it("falls back safely when data is malformed or absent", () => {
    const script = mount({ home, status }); script.textContent = "invalid";
    expect(readPublicBootstrap()).toBeUndefined(); script.remove(); expect(readPublicBootstrap()).toBeUndefined();
  });
});
