// @vitest-environment jsdom
import React, { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import NavigationReview from "../../src/ui/NavigationReview";
const loading = vi.hoisted(() => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
});
vi.mock("../../src/ui/NavigationReviewDialog", async () => {
  await loading.promise;
  return {
    default: ({
      busy,
      cancel,
      discard,
    }: {
      busy: boolean;
      cancel: () => void;
      discard: () => void;
    }) => {
      if (busy) throw Error("Fictional navigation review render failure");
      return (
        <div role="alertdialog" aria-label="Loaded fictional review">
          <button onClick={cancel}>Cancel loaded review</button>
          <button onClick={discard}>Approve fictional navigation</button>
        </div>
      );
    },
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("keeps loading/error reviews cancellable and restores only cancelled navigation focus", async () => {
  // jsdom has no top-layer dialog implementation. These stubs model lifecycle
  // only; real focus containment/background inertness is checked in six engines.
  const prototype = HTMLDialogElement.prototype;
  const show = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  const close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
  Object.defineProperty(prototype, "showModal", {
    configurable: true,
    value: show,
  });
  Object.defineProperty(prototype, "close", {
    configurable: true,
    value: close,
  });
  const approve = vi.fn();
  function Harness({ failed = false }: { failed?: boolean }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Fictional opener</button>
        <button>Fictional destination</button>
        {open && (
          <NavigationReview
            busy={failed}
            labels={["Fictional unsaved work"]}
            cancel={() => setOpen(false)}
            discard={() => {
              approve();
              setOpen(false);
              screen
                .getByRole("button", { name: "Fictional destination" })
                .focus();
            }}
          />
        )}
      </>
    );
  }
  const logger = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const first = render(<Harness />);
    const opener = screen.getByRole("button", { name: "Fictional opener" });
    opener.focus();
    fireEvent.click(opener);
    const pending = screen.getByRole("dialog", {
      name: "Preparing navigation review",
    });
    expect(show).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Stay on this page" }),
    );
    expect(
      screen.queryByRole("button", { name: "Approve fictional navigation" }),
    ).toBeNull();
    const escape = new Event("cancel", { cancelable: true });
    fireEvent(pending, escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
    fireEvent.click(opener);
    await act(async () => {
      loading.release();
      await loading.promise;
    });
    await screen.findByRole("alertdialog", { name: "Loaded fictional review" });
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel loaded review" }),
    );
    expect(document.activeElement).toBe(opener);
    fireEvent.click(opener);
    await screen.findByRole("alertdialog", { name: "Loaded fictional review" });
    fireEvent.click(
      screen.getByRole("button", { name: "Approve fictional navigation" }),
    );
    expect(approve).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Fictional destination" }),
    );
    first.unmount();
    render(<Harness failed />);
    const errorOpener = screen.getByRole("button", {
      name: "Fictional opener",
    });
    errorOpener.focus();
    fireEvent.click(errorOpener);
    await screen.findByRole("dialog", {
      name: "Navigation review could not load",
    });
    expect(logger).toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Approve fictional navigation" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stay on this page" }));
    await waitFor(() => expect(document.activeElement).toBe(errorOpener));
    expect(approve).toHaveBeenCalledTimes(1);
  } finally {
    loading.release();
    cleanup();
    delete (prototype as Partial<HTMLDialogElement>).showModal;
    delete (prototype as Partial<HTMLDialogElement>).close;
  }
});
