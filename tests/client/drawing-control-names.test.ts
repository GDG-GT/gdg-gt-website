// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { observeDrawingControlNames } from "../../src/ui/whiteboards/drawing-control-names";

afterEach(() => document.body.replaceChildren());
describe("embedded drawing control accessible names", () => {
  it("names late-mounted controls and tracks the visible zoom percentage", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const disconnect = observeDrawingControlNames(host);
    try {
      host.innerHTML =
        '<button class="main-menu-trigger"></button><button class="reset-zoom-button" title="Reset zoom" aria-label="Reset zoom">100%</button>';
      const menu = host.querySelector(".main-menu-trigger")!;
      const zoom = host.querySelector(".reset-zoom-button")!;
      await waitFor(() =>
        expect(menu.getAttribute("aria-label")).toBe("Drawing menu"),
      );
      expect(zoom.getAttribute("aria-label")).toBe("100% · Reset zoom");
      zoom.firstChild!.textContent = "80%";
      await waitFor(() =>
        expect(zoom.getAttribute("aria-label")).toBe("80% · Reset zoom"),
      );
      zoom.setAttribute("aria-label", "Reset zoom");
      await waitFor(() =>
        expect(zoom.getAttribute("aria-label")).toBe("80% · Reset zoom"),
      );
    } finally {
      disconnect();
    }
  });

  it("preserves an existing menu name, ignores other buttons and disconnects on teardown", async () => {
    const host = document.createElement("div");
    host.innerHTML =
      '<button class="main-menu-trigger" aria-label="Existing drawing menu"></button><button class="reset-zoom-button">Loading</button><button aria-label="Save drawing">Save</button>';
    document.body.append(host);
    const disconnect = observeDrawingControlNames(host);
    expect(host.firstElementChild!.getAttribute("aria-label")).toBe(
      "Existing drawing menu",
    );
    expect(host.children[1].hasAttribute("aria-label")).toBe(false);
    expect(host.children[2].getAttribute("aria-label")).toBe("Save drawing");
    disconnect();
    host.children[1].textContent = "75%";
    await Promise.resolve();
    expect(host.children[1].hasAttribute("aria-label")).toBe(false);
  });
});
