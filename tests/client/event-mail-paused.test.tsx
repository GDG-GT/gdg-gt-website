// @vitest-environment jsdom
import React from "react";
import {
  render,
  cleanup,
  screen,
  fireEvent,
  act,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import EventMailPanel from "../../src/ui/EventMailPanel";
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/hooks/useDraftGuard", () => ({
  useDraftGuard: vi.fn(),
  useNavigationSafety: () => ({ request: vi.fn() }),
}));
beforeEach(() => {
  apiMock.mockReset();
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const panel = (disabled: boolean) => (
  <EventMailPanel
    eventId="fictional-event"
    disabled={disabled}
    onClose={vi.fn()}
    onQueued={vi.fn()}
  />
);
it("retains actual message fields while parent read recovery pauses the panel and refuses submit", () => {
  const view = render(panel(false));
  const subject = screen.getByLabelText(/^Subject/) as HTMLInputElement;
  const message = screen.getByLabelText(/^Message/) as HTMLTextAreaElement;
  fireEvent.change(subject, { target: { value: "Fictional subject" } });
  fireEvent.change(message, {
    target: { value: "Fictional retained message" },
  });
  view.rerender(panel(true));
  fireEvent.submit(subject.closest("form")!);
  expect(apiMock).not.toHaveBeenCalled();
  expect(subject.matches(":disabled")).toBe(true);
  expect(message.value).toBe("Fictional retained message");
  view.rerender(panel(false));
  expect(subject.value).toBe("Fictional subject");
  expect(message.matches(":disabled")).toBe(false);
});
it("refuses offline mail submission even before a parent render catches up", () => {
  render(panel(false));
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: false,
  });
  fireEvent.submit(screen.getByLabelText(/^Subject/).closest("form")!);
  expect(apiMock).not.toHaveBeenCalled();
});
it("clears unsent message fields when the private session is cleared", () => {
  render(panel(false));
  const subject = screen.getByLabelText(/^Subject/) as HTMLInputElement;
  fireEvent.change(subject, { target: { value: "Fictional private subject" } });
  act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
  expect(screen.queryByLabelText(/^Subject/)).toBeNull();
  expect(screen.queryByDisplayValue("Fictional private subject")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Recheck event email access" }),
  ).toBeTruthy();
});
