// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { scrollWithKeyboard } from "../../src/ui/keyboard-scroll";
afterEach(cleanup);
function panel(height = 1000) {
  render(
    <div
      role="region"
      aria-label="Fictional long review"
      tabIndex={0}
      onKeyDown={(event) => scrollWithKeyboard(event, "vertical")}
    >
      <input aria-label="Nested control" />
    </div>,
  );
  const region = screen.getByRole("region", { name: "Fictional long review" });
  Object.defineProperties(region, {
    clientHeight: { value: 200 },
    scrollHeight: { value: height },
  });
  return region;
}
it("reaches the full review by arrows, pages and endpoints without leaving its bounds", () => {
  const region = panel();
  region.focus();
  expect(document.activeElement).toBe(region);
  fireEvent.keyDown(region, { key: "ArrowDown" });
  expect(region.scrollTop).toBeGreaterThan(0);
  fireEvent.keyDown(region, { key: "ArrowUp" });
  expect(region.scrollTop).toBe(0);
  fireEvent.keyDown(region, { key: "PageDown" });
  expect(region.scrollTop).toBeGreaterThan(0);
  fireEvent.keyDown(region, { key: "PageUp" });
  expect(region.scrollTop).toBe(0);
  fireEvent.keyDown(region, { key: "End" });
  expect(region.scrollTop).toBe(800);
  fireEvent.keyDown(region, { key: "ArrowDown" });
  expect(region.scrollTop).toBe(800);
  fireEvent.keyDown(region, { key: "Home" });
  fireEvent.keyDown(region, { key: "ArrowUp" });
  expect(region.scrollTop).toBe(0);
});
it("preserves nested controls, modified keys and the other axis", () => {
  const region = panel();
  for (const target of [screen.getByRole("textbox"), region]) {
    const cases =
      target === region
        ? [
            { key: "ArrowDown", ctrlKey: true },
            { key: "PageDown", altKey: true },
            { key: "End", shiftKey: true },
            { key: "Home", metaKey: true },
            { key: "ArrowRight" },
          ]
        : [{ key: "PageDown" }];
    for (const options of cases) {
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...options,
      });
      fireEvent(target, event);
      expect(event.defaultPrevented).toBe(false);
      expect(region.scrollTop).toBe(0);
    }
  }
});
it("does not consume ordinary page navigation when the content fits", () => {
  const region = panel(200);
  const event = new KeyboardEvent("keydown", {
    key: "PageDown",
    bubbles: true,
    cancelable: true,
  });
  fireEvent(region, event);
  expect(event.defaultPrevented).toBe(false);
  expect(region.scrollTop).toBe(0);
});
