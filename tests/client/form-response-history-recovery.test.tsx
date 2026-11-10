// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiFailure } from "../../src/lib/api";
import ResponseHistory from "../../src/ui/forms/ResponseHistory";
const { apiMock, identity } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  identity: { id: "fictional-reviewer", role: "admin" },
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: identity.id ? identity : null }),
}));
const root = "/admin/forms/fictional-form/responses/fictional-response/history";
const props = {
  formId: "fictional-form",
  responseId: "fictional-response",
  canSensitive: true,
};
function inventory(overrides = {}) {
  return {
    items: [
      { revision: 1, recordedAt: "2026-11-06T12:00:00Z", current: true },
      { revision: 0, recordedAt: "2026-11-05T12:00:00Z", current: false },
    ],
    currentRevision: 1,
    version: 1,
    total: 2,
    page: 1,
    pageSize: 20,
    redacted: false,
    ...overrides,
  };
}
function snapshot(overrides = {}) {
  return {
    responseId: props.responseId,
    revision: 0,
    version: 1,
    current: false,
    recordedAt: "2026-11-05T12:00:00Z",
    redacted: false,
    fields: [
      {
        id: "name",
        label: "Original fictional question",
        type: "text",
        sensitive: false,
        masked: false,
        answered: true,
        value: "Fictional historical answer",
      },
      {
        id: "email",
        label: "Private fictional question",
        type: "email",
        sensitive: true,
        masked: true,
        answered: true,
        value: null,
      },
    ],
    ...overrides,
  };
}
function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function open() {
  fireEvent.click(
    screen.getByRole("button", { name: "Review revision history" }),
  );
  await screen.findByRole("button", { name: "Revision 0", exact: true });
}
async function select() {
  fireEvent.click(
    screen.getByRole("button", { name: "Revision 0", exact: true }),
  );
  await screen.findByText("Fictional historical answer");
}
beforeEach(() => {
  apiMock.mockReset();
  identity.id = "fictional-reviewer";
  identity.role = "admin";
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
  apiMock.mockImplementation((path: string) =>
    Promise.resolve(path.includes("/history?") ? inventory() : snapshot()),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Private response history recovery", () => {
  it("reads only after explicit opening and aborts pending work on close without accepting late answers", async () => {
    const value = pending<ReturnType<typeof snapshot>>();
    render(<ResponseHistory {...props} />);
    expect(apiMock).not.toHaveBeenCalled();
    await open();
    apiMock.mockReturnValueOnce(value.promise);
    fireEvent.click(
      screen.getByRole("button", { name: "Revision 0", exact: true }),
    );
    const signal = apiMock.mock.calls.at(-1)![1].signal;
    fireEvent.click(
      screen.getByRole("button", { name: "Close revision history" }),
    );
    expect(signal.aborted).toBe(true);
    await act(async () => value.resolve(snapshot()));
    expect(screen.queryByText("Fictional historical answer")).toBeNull();
    await open();
    expect(screen.queryByText("Fictional historical answer")).toBeNull();
  });
  it("distinguishes an initial inventory failure from empty history and retries explicitly", async () => {
    apiMock.mockRejectedValueOnce(Error("Fictional inventory unavailable"));
    render(<ResponseHistory {...props} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Review revision history" }),
    );
    await screen.findByText("Fictional inventory unavailable");
    expect(screen.queryByText(/0 revisions/)).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Reload history", exact: true }),
    );
    await screen.findByText(/2 revisions/);
    expect(screen.queryByText("Fictional inventory unavailable")).toBeNull();
  });
  it("retries a failed selected snapshot without reloading the inventory or dropping its selection", async () => {
    render(<ResponseHistory {...props} />);
    await open();
    apiMock.mockRejectedValueOnce(Error("Fictional selected read failed"));
    fireEvent.click(
      screen.getByRole("button", { name: "Revision 0", exact: true }),
    );
    await screen.findByText("Fictional selected read failed");
    expect(screen.getByText(/2 revisions/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Reload selected revision" }),
    );
    await screen.findByText("Fictional historical answer");
    expect(apiMock.mock.calls.map(([path]) => path)).toEqual([
      root + "?page=1",
      root + "/0?sensitive=true",
      root + "/0?sensitive=true",
    ]);
    expect(
      screen.getByRole("region", { name: "Selected revision 0", exact: true }),
    ).toBe(document.activeElement);
  });
  it("retains a timestamped matching snapshot on a temporary reread failure", async () => {
    render(<ResponseHistory {...props} />);
    await open();
    await select();
    apiMock.mockRejectedValueOnce(
      new ApiFailure(503, "UNAVAILABLE", "Fictional snapshot outage"),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Reload selected revision" }),
    );
    await screen.findByText("Fictional snapshot outage");
    expect(screen.getByText("Fictional historical answer")).toBeTruthy();
    expect(
      screen
        .getByText(/Last successful selected revision read/)
        .querySelector("time")?.dateTime,
    ).toBeTruthy();
  });
  it("retains inventory and selected answers independently while pausing choices after a failed inventory reread", async () => {
    render(<ResponseHistory {...props} />);
    await open();
    await select();
    apiMock.mockRejectedValueOnce(Error("Fictional inventory outage"));
    fireEvent.click(
      screen.getByRole("button", { name: "Reload history", exact: true }),
    );
    await screen.findByText("Fictional inventory outage");
    expect(screen.getByText("Fictional historical answer")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Revision 0",
          exact: true,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByText(/Last successful history read/)).toBeTruthy();
  });
  for (const status of [401, 403, 404])
    for (const source of ["inventory", "snapshot"]) {
      it(`clears both private reads on ${status} from ${source} and needs explicit access recheck`, async () => {
        render(<ResponseHistory {...props} />);
        await open();
        await select();
        apiMock.mockRejectedValueOnce(
          new ApiFailure(status, "DENIED", "Fictional access changed"),
        );
        fireEvent.click(
          screen.getByRole("button", {
            name:
              source === "inventory"
                ? "Reload history"
                : "Reload selected revision",
            exact: true,
          }),
        );
        await screen.findByText(
          "Private history and selected answers have been cleared.",
        );
        expect(screen.queryByText("Fictional historical answer")).toBeNull();
        expect(screen.queryByText(/2 revisions/)).toBeNull();
        const reads = apiMock.mock.calls.length;
        await act(async () => {});
        expect(apiMock.mock.calls.length).toBe(reads);
        fireEvent.click(
          screen.getByRole("button", {
            name: "Recheck response history access",
          }),
        );
        await screen.findByRole("button", { name: "Revision 0", exact: true });
        expect(screen.queryByText("Fictional historical answer")).toBeNull();
        expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
          false,
        );
      });
    }
  it("fences late responses when switching selected revisions", async () => {
    const old = pending<ReturnType<typeof snapshot>>();
    render(<ResponseHistory {...props} />);
    await open();
    apiMock.mockReturnValueOnce(old.promise);
    fireEvent.click(
      screen.getByRole("button", { name: "Revision 0", exact: true }),
    );
    const signal = apiMock.mock.calls.at(-1)![1].signal;
    apiMock.mockResolvedValueOnce(snapshot({ revision: 1, fields: [] }));
    fireEvent.click(
      screen.getByRole("button", { name: "Revision 1 · Current", exact: true }),
    );
    await screen.findByRole("region", { name: "Revision 1 answers" });
    expect(signal.aborted).toBe(true);
    await act(async () => old.resolve(snapshot()));
    expect(screen.queryByText("Fictional historical answer")).toBeNull();
  });
  it("conceals revealed answers immediately when returning to masked mode and cancels obsolete reveal reads", async () => {
    render(<ResponseHistory {...props} />);
    await open();
    await select();
    fireEvent.click(screen.getByRole("checkbox"));
    await screen.findByText("Hidden by default");
    apiMock.mockResolvedValueOnce(
      snapshot({
        fields: [
          {
            ...snapshot().fields[1],
            masked: false,
            value: "fictional-private@example.test",
          },
        ],
      }),
    );
    fireEvent.click(screen.getByRole("checkbox"));
    await screen.findByText("fictional-private@example.test");
    const delayed = pending<ReturnType<typeof snapshot>>();
    apiMock.mockReturnValueOnce(delayed.promise);
    fireEvent.click(
      screen.getByRole("button", { name: "Reload selected revision" }),
    );
    const signal = apiMock.mock.calls.at(-1)![1].signal;
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.queryByText("fictional-private@example.test")).toBeNull();
    expect(signal.aborted).toBe(true);
    await act(async () =>
      delayed.resolve(
        snapshot({
          fields: [
            {
              ...snapshot().fields[1],
              masked: false,
              value: "fictional-private@example.test",
            },
          ],
        }),
      ),
    );
    expect(screen.queryByText("fictional-private@example.test")).toBeNull();
    await screen.findByText("Hidden by default");
  });
  for (const change of [
    "account",
    "role",
    "form",
    "response",
    "sensitive permission",
  ]) {
    it(`removes the previous private workspace synchronously on ${change} replacement`, async () => {
      const view = render(<ResponseHistory {...props} />);
      await open();
      await select();
      if (change === "account") identity.id = "other-fictional-reviewer";
      if (change === "role") identity.role = "team_member";
      view.rerender(
        <ResponseHistory
          {...props}
          formId={change === "form" ? "other-form" : props.formId}
          responseId={
            change === "response" ? "other-response" : props.responseId
          }
          canSensitive={change !== "sensitive permission"}
        />,
      );
      expect(screen.queryByText("Fictional historical answer")).toBeNull();
      expect(apiMock.mock.calls).toHaveLength(2);
    });
  }
  it("clears and cancels on sign-in invalidation and cannot reopen under the same stale session", async () => {
    const old = pending<ReturnType<typeof snapshot>>();
    render(<ResponseHistory {...props} />);
    await open();
    apiMock.mockReturnValueOnce(old.promise);
    fireEvent.click(
      screen.getByRole("button", { name: "Revision 0", exact: true }),
    );
    const signal = apiMock.mock.calls.at(-1)![1].signal;
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    expect(signal.aborted).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Review revision history",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await act(async () => old.resolve(snapshot()));
    expect(screen.queryByText("Fictional historical answer")).toBeNull();
  });
  it("pauses offline reads and does not automatically fetch or reveal on reconnection", async () => {
    render(<ResponseHistory {...props} />);
    await open();
    await select();
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    const calls = apiMock.mock.calls.length;
    expect(
      (
        screen.getByRole("button", {
          name: "Reload selected revision",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(
      false,
    );
    expect(screen.getByText("Fictional historical answer")).toBeTruthy();
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    expect(apiMock.mock.calls.length).toBe(calls);
  });
  it("invalidates selected answers when refreshed history reports redaction or a newer current revision", async () => {
    render(<ResponseHistory {...props} />);
    await open();
    await select();
    const delayed = pending<ReturnType<typeof snapshot>>();
    apiMock
      .mockResolvedValueOnce(inventory({ redacted: true, currentRevision: 2 }))
      .mockReturnValueOnce(delayed.promise);
    fireEvent.click(
      screen.getByRole("button", { name: "Reload history", exact: true }),
    );
    await screen.findByText(/Identity redacted across history/);
    expect(screen.queryByText("Fictional historical answer")).toBeNull();
    await act(async () =>
      delayed.resolve(snapshot({ redacted: true, fields: [] })),
    );
    await screen.findByText(/Identity redacted$/);
  });
  it("clears selected answers across page changes and cannot show a substituted response snapshot", async () => {
    apiMock.mockResolvedValueOnce(inventory({ total: 21 }));
    render(<ResponseHistory {...props} />);
    await open();
    await select();
    const delayed = pending<ReturnType<typeof inventory>>();
    apiMock.mockReturnValueOnce(delayed.promise);
    fireEvent.click(screen.getByRole("button", { name: "Older revisions" }));
    expect(screen.queryByText("Fictional historical answer")).toBeNull();
    await act(async () => delayed.resolve(inventory({ page: 2 })));
    apiMock.mockResolvedValueOnce(
      snapshot({ responseId: "wrong-fictional-response" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Revision 0", exact: true }),
    );
    await screen.findByText(/selected snapshot could not be verified/);
    expect(screen.queryByText("Fictional historical answer")).toBeNull();
  });
  it("can hide sensitive answers offline without issuing a masked read until explicit reload", async () => {
    render(<ResponseHistory {...props} />);
    await open();
    await select();
    fireEvent.click(screen.getByRole("checkbox"));
    await screen.findByText("Hidden by default");
    apiMock.mockResolvedValueOnce(
      snapshot({
        fields: [
          {
            ...snapshot().fields[1],
            masked: false,
            value: "fictional-private@example.test",
          },
        ],
      }),
    );
    fireEvent.click(screen.getByRole("checkbox"));
    await screen.findByText("fictional-private@example.test");
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    const reads = apiMock.mock.calls.length;
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.queryByText("fictional-private@example.test")).toBeNull();
    expect(apiMock.mock.calls.length).toBe(reads);
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    expect(apiMock.mock.calls.length).toBe(reads);
    fireEvent.click(
      screen.getByRole("button", { name: "Reload selected revision" }),
    );
    await screen.findByText("Hidden by default");
    expect(apiMock.mock.calls.at(-1)![0]).toBe(root + "/0?sensitive=false");
  });
  it("has no protected read or private UI without a current account", () => {
    identity.id = "";
    render(<ResponseHistory {...props} />);
    expect(apiMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
