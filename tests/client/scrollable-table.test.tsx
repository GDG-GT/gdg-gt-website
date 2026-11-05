// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import ScrollableTable from "../../src/ui/ScrollableTable";
afterEach(cleanup);
it("provides named keyboard focus and horizontal navigation without hijacking nested controls", () => {
  render(
    <ScrollableTable label="Fictional record table">
      <table>
        <tbody>
          <tr>
            <td>
              <input aria-label="Fictional field" />
            </td>
          </tr>
        </tbody>
      </table>
    </ScrollableTable>,
  );
  const region = screen.getByRole("region", { name: "Fictional record table" });
  Object.defineProperties(region, {
    clientWidth: { value: 200 },
    scrollWidth: { value: 600 },
  });
  expect(region.tabIndex).toBe(0);
  region.focus();
  expect(document.activeElement).toBe(region);
  fireEvent.keyDown(region, { key: "ArrowRight" });
  expect(region.scrollLeft).toBe(48);
  fireEvent.keyDown(region, { key: "ArrowLeft" });
  expect(region.scrollLeft).toBe(0);
  fireEvent.keyDown(region, { key: "End" });
  expect(region.scrollLeft).toBe(400);
  fireEvent.keyDown(region, { key: "Home" });
  expect(region.scrollLeft).toBe(0);
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "ArrowRight" });
  expect(region.scrollLeft).toBe(0);
  fireEvent.keyDown(region, { key: "ArrowRight", ctrlKey: true });
  expect(region.scrollLeft).toBe(0);
  fireEvent.keyDown(region, { key: "ArrowDown" });
  expect(region.scrollLeft).toBe(0);
});
it("leaves normal keyboard behavior intact when the table fits", () => {
  render(
    <ScrollableTable label="Fitting table">
      <table>
        <tbody>
          <tr>
            <td>Fictional row</td>
          </tr>
        </tbody>
      </table>
    </ScrollableTable>,
  );
  const region = screen.getByRole("region");
  Object.defineProperties(region, {
    clientWidth: { value: 600 },
    scrollWidth: { value: 600 },
  });
  const event = new KeyboardEvent("keydown", {
    key: "ArrowRight",
    bubbles: true,
    cancelable: true,
  });
  fireEvent(region, event);
  expect(event.defaultPrevented).toBe(false);
  expect(region.scrollLeft).toBe(0);
});
