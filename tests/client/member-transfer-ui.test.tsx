// @vitest-environment jsdom
import React from "react";
import axe from "axe-core";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MemberTransfers from "../../src/ui/members/MemberTransfers";
import type { Capabilities } from "../../src/ui/members/types";
const { apiMock, imported, actor, objectUrl, revokeUrl } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  imported: vi.fn(),
  actor: { id: "fictional-transfer", role: "admin" },
  objectUrl: vi.fn(),
  revokeUrl: vi.fn(),
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: actor }),
}));
vi.mock("@/hooks/useDraftGuard", () => ({
  useDraftGuard: vi.fn(),
  useNavigationSafety: () => ({ request: (run: () => void) => run() }),
}));
const cap: Capabilities = { globalCreate: true, teams: [], merge: false },
  team = "f1500000-0000-4000-8000-000000000001",
  csv = "name,email\nFictional Person,PERSON@example.test",
  filters = {
    q: "Fictional",
    state: "current",
    category: "member",
    active: true,
  };
const review = () => ({
  reviewId: "f1500000-0000-4000-8000-000000000002",
  reviewToken: "f".repeat(43),
  expiresAt: new Date(Date.now() + 60000).toISOString(),
  eligible: 1,
  skippedRows: [],
});
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
const props = (
  capability: Capabilities | undefined = cap,
  disabled = false,
) => ({ cap: capability, filters, disabled, onImported: imported });
function mount(capability: Capabilities | undefined = cap, disabled = false) {
  return render(<MemberTransfers {...props(capability, disabled)} />);
}
async function parse(source = csv) {
  fireEvent.click(
    screen.getByRole("button", { name: "Import CSV", exact: true }),
  );
  fireEvent.click(screen.getByText("Paste CSV instead", { exact: true }));
  fireEvent.change(screen.getByLabelText(/CSV content/), {
    target: { value: source },
  });
  fireEvent.click(screen.getByRole("button", { name: "Validate pasted CSV" }));
}
async function preview() {
  await parse();
  fireEvent.click(
    screen.getByRole("button", { name: "Review import", exact: true }),
  );
  await screen.findByRole("heading", { name: "1 new record · 0 skipped" });
}
function confirm() {
  fireEvent.change(screen.getByLabelText(/Import confirmation/), {
    target: { value: "IMPORT 1" },
  });
  fireEvent.change(screen.getByLabelText("Current password"), {
    target: { value: "Fictional-import-confirmation" },
  });
  return screen.getByRole("button", { name: "Confirm import", exact: true });
}
beforeEach(() => {
  apiMock.mockReset();
  imported.mockReset();
  objectUrl.mockReset().mockReturnValue("blob:fictional-download");
  revokeUrl.mockReset();
  actor.id = "fictional-transfer";
  actor.role = "admin";
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const originalURL = URL;
  vi.stubGlobal(
    "URL",
    class extends originalURL {
      static createObjectURL = objectUrl;
      static revokeObjectURL = revokeUrl;
    },
  );
  apiMock.mockImplementation((path: string) =>
    Promise.resolve(
      path.endsWith("import-preview")
        ? review()
        : path.endsWith("/export")
          ? {
              csv: "name\r\nFictional Person",
              filename: "fictional-members.csv",
              count: 1,
            }
          : { created: 1, skipped: 0 },
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("Community member CSV interaction and confirmation", () => {
  it("requires a create scope for import and respects the parent disabled state", () => {
    const page = mount({ globalCreate: false, teams: [], merge: false });
    expect(
      (screen.getByRole("button", { name: "Import CSV" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    page.rerender(<MemberTransfers {...props(cap, true)} />);
    expect(
      (screen.getByRole("button", { name: "Export CSV" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("focuses parse errors and blocks row-invalid batches before any API request", async () => {
    mount();
    await parse("wrong,email\nFictional Person,person@example.test");
    const error = await screen.findByRole("alert");
    expect(document.activeElement).toBe(error);
    fireEvent.change(screen.getByLabelText(/CSV content/), {
      target: { value: "name,email\nFictional Person,invalid-email" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Validate pasted CSV" }),
    );
    expect(document.activeElement?.textContent).toContain(
      "0 valid rows · 1 to fix",
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Review import",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(apiMock).not.toHaveBeenCalled();
  });
  it("rejects oversized files before reading their contents", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));
    const text = vi.fn();
    fireEvent.change(screen.getByLabelText("Member CSV file"), {
      target: { files: [{ size: 1048577, text }] },
    });
    const error = await screen.findByRole("alert");
    expect(error.textContent).toContain("no larger than 1 MiB");
    expect(document.activeElement).toBe(error);
    expect(text).not.toHaveBeenCalled();
    expect(apiMock).not.toHaveBeenCalled();
  });
  it("reviews normalized rows in the chosen scope and focuses the server review", async () => {
    mount({
      globalCreate: false,
      merge: false,
      teams: [{ id: team, name: "Fictional import team" }],
    });
    await preview();
    expect(apiMock.mock.calls[0][1].body).toMatchObject({
      teamId: team,
      rows: [{ name: "Fictional Person", email: "person@example.test" }],
    });
    expect(document.activeElement?.textContent).toBe(
      "1 new record · 0 skipped",
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm import",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("freezes preview synchronously so two events cannot start competing reviews", async () => {
    const pending = deferred<unknown>();
    apiMock.mockReturnValue(pending.promise);
    mount();
    await parse();
    const button = screen.getByRole("button", { name: "Review import" });
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByLabelText(/CSV content/) as HTMLTextAreaElement).disabled,
    ).toBe(true);
    await act(async () => pending.resolve(review()));
  });
  it("clears an invalidated review and password when source or destination changes", async () => {
    mount({
      globalCreate: true,
      merge: false,
      teams: [{ id: team, name: "Fictional import team" }],
    });
    await preview();
    confirm();
    fireEvent.change(screen.getByLabelText(/Destination scope/), {
      target: { value: team },
    });
    expect(screen.queryByRole("button", { name: "Confirm import" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Review import" }));
    await screen.findByLabelText("Current password");
    expect(
      (screen.getByLabelText("Current password") as HTMLInputElement).value,
    ).toBe("");
    fireEvent.change(screen.getByLabelText(/CSV content/), {
      target: { value: csv + "\nSecond Person,second@example.test" },
    });
    expect(screen.queryByRole("button", { name: "Confirm import" })).toBeNull();
  });
  it("blocks review of a destination after its specific team grant is removed", async () => {
    const page = mount({
      globalCreate: false,
      merge: false,
      teams: [{ id: team, name: "Fictional old team" }],
    });
    await preview();
    confirm();
    page.rerender(
      <MemberTransfers
        {...props({
          globalCreate: false,
          merge: false,
          teams: [
            {
              id: "f1500000-0000-4000-8000-000000000003",
              name: "Fictional other team",
            },
          ],
        })}
      />,
    );
    expect(screen.queryByRole("button", { name: "Confirm import" })).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Review import",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByLabelText(/CSV content/)).toBeTruthy();
  });
  it("checks expiry at action time even before the browser timer runs", async () => {
    mount();
    await preview();
    const button = confirm();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 120000);
    fireEvent.click(button);
    await screen.findByText("This review expired. Choose Review import again.");
    expect(
      apiMock.mock.calls.filter(([path]) => path.endsWith("/import")),
    ).toHaveLength(0);
  });
  it("clears the password immediately, prevents duplicate commits and focuses one completed receipt", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith("import-preview") ? review() : pending.promise,
      ),
    );
    mount();
    await preview();
    const button = confirm();
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const commits = apiMock.mock.calls.filter(([path]) =>
      path.endsWith("/import"),
    );
    expect(commits).toHaveLength(1);
    expect(commits[0][1]).toMatchObject({
      idempotencyKey: expect.any(String),
      body: {
        confirmation: "IMPORT 1",
        currentPassword: "Fictional-import-confirmation",
      },
    });
    expect(
      (screen.getByLabelText("Current password") as HTMLInputElement).value,
    ).toBe("");
    await act(async () => pending.resolve({ created: 1, skipped: 0 }));
    await waitFor(() =>
      expect(document.activeElement?.textContent).toBe(
        "Imported 1 community records. 0 existing or unavailable emails were skipped.",
      ),
    );
    expect(imported).toHaveBeenCalledTimes(1);
  });
  it("retains the reviewed batch/key after a failed commit so explicit retry deduplicates", async () => {
    let failed = true;
    apiMock.mockImplementation((path: string) =>
      path.endsWith("import-preview")
        ? Promise.resolve(review())
        : failed
          ? Promise.reject(Error("Import could not be confirmed"))
          : Promise.resolve({ created: 1, skipped: 0 }),
    );
    mount();
    await preview();
    fireEvent.click(confirm());
    const error = await screen.findByRole("alert");
    expect(document.activeElement).toBe(error);
    expect(
      (screen.getByLabelText(/CSV content/) as HTMLTextAreaElement).value,
    ).toBe(csv);
    failed = false;
    fireEvent.click(confirm());
    await screen.findByText(/Imported 1 community records/);
    const commits = apiMock.mock.calls.filter(([path]) =>
      path.endsWith("/import"),
    );
    expect(commits[0][1].idempotencyKey).toBe(commits[1][1].idempotencyKey);
    expect(imported).toHaveBeenCalledTimes(1);
  });
});
describe("Community directory exports and private lifecycle", () => {
  it("exports the active filters with private fields off by default, and resets consent for the next export", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
      false,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Download filtered CSV" }),
    );
    await waitFor(() =>
      expect(document.activeElement?.textContent).toContain(
        "Prepared a CSV with 1 matching community records.",
      ),
    );
    expect(apiMock.mock.calls[0][1].body).toEqual({
      filters,
      includePrivate: false,
    });
    expect(objectUrl).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Close", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
      false,
    );
  });
  it("keeps a failed export recoverable and produces no download", async () => {
    apiMock.mockRejectedValue(Error("Export interrupted"));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Download filtered CSV" }),
    );
    const error = await screen.findByRole("alert");
    expect(document.activeElement).toBe(error);
    expect(objectUrl).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Download filtered CSV" }),
    ).toBeTruthy();
  });
  it("preserves CSV input offline, discards the old review and requires explicit review after reconnect", async () => {
    const online = vi.spyOn(navigator, "onLine", "get");
    online.mockReturnValue(true);
    mount();
    await preview();
    confirm();
    online.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByText(/You are offline. CSV input remains/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirm import" })).toBeNull();
    expect(
      (screen.getByLabelText(/CSV content/) as HTMLTextAreaElement).value,
    ).toBe(csv);
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Review import" })).toBeTruthy();
  });
  it("aborts a pending import when the session clears and ignores its late server result", async () => {
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    apiMock.mockImplementation(
      (path: string, options: { signal: AbortSignal }) => {
        if (path.endsWith("import-preview")) return Promise.resolve(review());
        signal = options.signal;
        return pending.promise;
      },
    );
    mount();
    await preview();
    fireEvent.click(confirm());
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve({ created: 1, skipped: 0 }));
    expect(imported).not.toHaveBeenCalled();
    expect(screen.queryByText(/Imported 1 community records/)).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("clears private CSVs on an account change and ignores a late file read after unmount", async () => {
    const pending = deferred<string>(),
      page = mount();
    fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));
    fireEvent.change(screen.getByLabelText("Member CSV file"), {
      target: { files: [{ size: 64, text: () => pending.promise }] },
    });
    actor.id = "fictional-other-account";
    page.rerender(<MemberTransfers {...props()} />);
    await act(async () => pending.resolve(csv));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(apiMock).not.toHaveBeenCalled();
  });
  it("restores the opening control on an ordinary modal close", async () => {
    mount();
    const opener = screen.getByRole("button", { name: "Export CSV" });
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("button", { name: "Close", exact: true }));
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
  it("passes axe structural checks for export options, import fields and reviewed confirmation", async () => {
    mount();
    const audit = async () => {
      const result = await axe.run(document.body, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
        },
        rules: { "color-contrast": { enabled: false } },
      });
      expect(
        result.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
      ).toEqual([]);
    };
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await audit();
    fireEvent.click(screen.getByRole("button", { name: "Close", exact: true }));
    await preview();
    await audit();
  });
});
