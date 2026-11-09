// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppDialogHost from "../../src/ui/AppDialogHost";
import { appDialogs, confirmAction } from "../../src/lib/app-dialogs";
afterEach(() => {
  cleanup();
  appDialogs.cancelAll();
  vi.restoreAllMocks();
});
it("requires an explicit choice in an app dialog and can cancel a destructive action", async () => {
  const native = vi.spyOn(window, "confirm");
  render(
    <MemoryRouter>
      <AppDialogHost />
    </MemoryRouter>,
  );
  let result!: Promise<boolean>;
  act(() => {
    result = confirmAction("This pass will stop working.", {
      title: "Revoke credential?",
      confirmLabel: "Revoke credential",
      cancelLabel: "Cancel",
      danger: true,
    });
  });
  expect(
    screen.getByRole("dialog", { name: "Revoke credential?" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  expect(await result).toBe(false);
  expect(native).not.toHaveBeenCalled();
});
it("cancels active and queued decisions if the account session changes", async () => {
  render(
    <MemoryRouter>
      <AppDialogHost />
    </MemoryRouter>,
  );
  let first!: Promise<boolean>, second!: Promise<boolean>;
  act(() => {
    first = confirmAction("First pending decision");
    second = confirmAction("Second pending decision");
  });
  act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
  expect(await first).toBe(false);
  expect(await second).toBe(false);
  expect(screen.queryByRole("dialog")).toBeNull();
});
