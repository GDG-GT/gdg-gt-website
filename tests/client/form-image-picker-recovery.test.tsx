// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FormImagePicker from "../../src/ui/forms/FormImagePicker";
import { ApiFailure } from "../../src/lib/api";
const { transport, identity } = vi.hoisted(() => ({
  transport: vi.fn(),
  identity: { id: "fictional-image-editor", role: "admin" },
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: transport,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: identity }),
}));
const photo = {
  id: "f1300000-0000-4000-8000-000000000001",
  alt_text: "Fictional approved workshop",
  description: "Fictional public image",
  width: 1200,
  height: 800,
};
const page = (n = 1) => ({
  items: [{ ...photo, id: photo.id.slice(0, -1) + n }],
  total: 65,
  page: n,
  pageSize: 30,
});
const change = vi.fn();
function mount(scope = "fictional-form:field-one", selected = photo.id) {
  return render(
    <FormImagePicker
      scope={scope}
      label="Published image"
      selected={selected}
      onChange={change}
    />,
  );
}
const select = () =>
  screen.getByRole("combobox", {
    name: /^Published image/,
  }) as HTMLSelectElement;
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
beforeEach(() => {
  transport.mockReset();
  change.mockReset();
  identity.id = "fictional-image-editor";
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  transport.mockImplementation(async (path: string) =>
    page(
      Number(new URL("https://example.test" + path).searchParams.get("page")),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Approved form image independent current-read recovery", () => {
  it("names loading without claiming the image inventory is empty", () => {
    transport.mockReturnValue(new Promise(() => {}));
    mount();
    expect(
      screen.getByRole("status", { name: "Loading published images" }),
    ).toBeTruthy();
    expect(select().disabled).toBe(true);
    expect(screen.queryByText(/No images are published/)).toBeNull();
    expect(select().value).toBe(photo.id);
  });
  it("retains the selected image and successful snapshot during failure, and retries read-only", async () => {
    mount();
    await screen.findByRole("option", { name: photo.alt_text });
    transport.mockRejectedValueOnce(Error("Fictional image read outage"));
    click("Recheck published images");
    await screen.findByText("Fictional image read outage");
    expect(screen.getByRole("option", { name: photo.alt_text })).toBeTruthy();
    expect(select().value).toBe(photo.id);
    expect(select().disabled).toBe(true);
    fireEvent.change(select(), { target: { value: "" } });
    expect(change).not.toHaveBeenCalled();
    click("Retry published images");
    await waitFor(() => expect(select().disabled).toBe(false));
    expect(transport.mock.calls.every(([, options]) => !options?.method)).toBe(
      true,
    );
  });
  it("changes only to an item on the current verified page and preserves selection across complete paging", async () => {
    mount();
    await screen.findByRole("option", { name: photo.alt_text });
    click("Next images");
    await screen.findByText("Page 2 · 65 matching");
    expect(select().value).toBe(photo.id);
    expect(screen.getByRole("option", { name: /Current image/ })).toBeTruthy();
    fireEvent.change(select(), {
      target: { value: photo.id.slice(0, -1) + "2" },
    });
    expect(change).toHaveBeenCalledWith({
      ...photo,
      id: photo.id.slice(0, -1) + "2",
    });
    click("Next images");
    await screen.findByText("Page 3 · 65 matching");
    expect(
      (screen.getByRole("button", { name: "Next images" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("offers return to the first page after a failed later page, without displaying stale rows", async () => {
    mount();
    await screen.findByRole("option", { name: photo.alt_text });
    transport.mockRejectedValueOnce(Error("Fictional later-page outage"));
    click("Next images");
    await screen.findByText("Fictional later-page outage");
    expect(screen.queryByRole("option", { name: photo.alt_text })).toBeNull();
    click("Return to first image page");
    await screen.findByRole("option", { name: photo.alt_text });
  });
  it("keeps Previous available when publication removal shrinks a later page to empty", async () => {
    mount();
    await screen.findByRole("option", { name: photo.alt_text });
    transport.mockResolvedValueOnce({ ...page(2), items: [], total: 0 });
    click("Next images");
    await screen.findByText("Page 2 · 0 matching");
    click("Previous images");
    await screen.findByText("Page 1 · 65 matching");
  });
  it.each([401, 403, 404])(
    "conceals previous public inventory on %s without clearing the proposed selection",
    async (status) => {
      mount();
      await screen.findByRole("option", { name: photo.alt_text });
      transport.mockRejectedValueOnce(
        new ApiFailure(status, "DENIED", "Fictional image access unavailable"),
      );
      click("Recheck published images");
      await screen.findByText("Fictional image access unavailable");
      expect(screen.queryByRole("option", { name: photo.alt_text })).toBeNull();
      expect(select().value).toBe(photo.id);
      expect(change).not.toHaveBeenCalled();
    },
  );
  it.each(["wrong-page", "external-id", "duplicate", "negative-size"])(
    "refuses malformed %s inventory",
    async (variant) => {
      const value = page();
      if (variant === "wrong-page") value.page = 2;
      if (variant === "external-id")
        value.items[0].id = "https://outside.example.test/pixel";
      if (variant === "duplicate") value.items.push(value.items[0]);
      if (variant === "negative-size") value.items[0].width = -1;
      transport.mockResolvedValue(value);
      mount();
      await screen.findByText(/published image list could not be verified/);
      expect(select().disabled).toBe(true);
      expect(screen.queryByRole("option", { name: photo.alt_text })).toBeNull();
    },
  );
  it("allows removal of the local selection during an outage without any write", async () => {
    transport.mockRejectedValue(Error("Fictional outage"));
    mount();
    await screen.findByText("Fictional outage");
    click("Remove selected image");
    expect(change).toHaveBeenCalledWith(null);
    expect(transport.mock.calls).toHaveLength(1);
  });
  it("requires explicit recheck after reconnect and never auto-changes a selection", async () => {
    mount();
    await screen.findByRole("option", { name: photo.alt_text });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    expect(select().disabled).toBe(true);
    expect(transport.mock.calls).toHaveLength(1);
    click("Recheck published images");
    await waitFor(() => expect(select().disabled).toBe(false));
    expect(change).not.toHaveBeenCalled();
  });
  it.each(["scope", "account", "session"])(
    "cancels a pending old %s inventory before accepting its late result",
    async (context) => {
      let finish!: (value: ReturnType<typeof page>) => void;
      transport.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      const view = mount();
      if (context === "account") identity.id = "fictional-second-editor";
      if (context === "session")
        act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
      else
        view.rerender(
          <FormImagePicker
            scope={
              context === "scope"
                ? "fictional-field-two"
                : "fictional-form:field-one"
            }
            label="Published image"
            selected={photo.id}
            onChange={change}
          />,
        );
      await screen.findByRole("option", { name: photo.alt_text });
      expect(transport.mock.calls[0][1].signal.aborted).toBe(true);
      await act(async () =>
        finish({
          ...page(),
          items: [{ ...photo, alt_text: "Obsolete image title" }],
        }),
      );
      expect(
        screen.queryByRole("option", { name: "Obsolete image title" }),
      ).toBeNull();
      expect(change).not.toHaveBeenCalled();
    },
  );
});
