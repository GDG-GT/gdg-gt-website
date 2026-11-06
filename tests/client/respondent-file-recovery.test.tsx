// @vitest-environment jsdom
import React, { useState } from "react";
import { webcrypto } from "node:crypto";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RespondentFileField from "../../src/ui/forms/RespondentFileField";
import { newField } from "../../shared/forms";
import { ApiFailure } from "../../src/lib/api";
import { type UploadStatus } from "../../src/ui/forms/respondent-upload";
const { transport } = vi.hoisted(() => ({ transport: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: transport,
}));
const fieldId = "f1300000-0000-4000-8000-000000000001",
  uploadId = "f1300000-0000-4000-8000-000000000002",
  context = {
    slug: "fictional-upload-form",
    versionId: "f1300000-0000-4000-8000-000000000003",
    uploadToken: "F".repeat(43),
  },
  field = {
    ...newField("file", "fictional-section"),
    id: fieldId,
    label: "Fictional attachment",
    maxFiles: 2,
    maxFileBytes: 1048576,
    allowedMime: ["text/plain"],
  },
  changes = vi.fn(),
  names = vi.fn(),
  busy = vi.fn(),
  denied = vi.fn(),
  put = vi.fn();
let state: UploadStatus["state"],
  accepted: boolean,
  loss: string,
  statusFailure: Error | undefined,
  removed: boolean,
  count: number;
const record = (id = uploadId): UploadStatus => ({
  uploadId: id,
  state,
  scanState: state === "clean" ? "clean" : "pending",
  filename: "fictional.txt",
  bytes: 4,
});
function Harness({
  initial = [] as string[],
  scope = context,
  readOnly = false,
}: {
  initial?: string[];
  scope?: typeof context;
  readOnly?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <span id={`field-${fieldId}-label`}>Fictional attachment</span>
      <RespondentFileField
        field={field}
        value={value}
        context={scope}
        readOnly={readOnly}
        onChange={(next) => {
          changes(next);
          setValue(next);
        }}
        onName={names}
        onBusy={busy}
        onAccessDenied={denied}
      />
      <output aria-label="Current attachment IDs">{value.join(",")}</output>
    </>
  );
}
function choose(name = "fictional.txt", type = "text/plain", bytes = "safe") {
  const file = new File([bytes], name, { type });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new TextEncoder().encode(bytes).buffer,
  });
  fireEvent.change(screen.getByLabelText("Fictional attachment"), {
    target: { files: [file] },
  });
}
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
const calls = (suffix: string) =>
  transport.mock.calls.filter(([path]) => path.endsWith(suffix));
beforeEach(() => {
  transport.mockReset();
  [changes, names, busy, denied, put].forEach((f) => f.mockReset());
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("fetch", put);
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  state = "pending";
  accepted = false;
  loss = "";
  statusFailure = undefined;
  removed = false;
  count = 0;
  put.mockImplementation(async () => {
    if (loss === "put") {
      loss = "";
      throw Error("Fictional direct transfer loss");
    }
    return { ok: true };
  });
  transport.mockImplementation(
    async (path: string, o: { body?: Record<string, unknown> }) => {
      if (path.endsWith("/prepare")) {
        if (loss === "prepare-before") {
          loss = "";
          throw Error("Fictional preparation loss");
        }
        if (!accepted) {
          accepted = true;
          count++;
        }
        if (loss === "prepare-after") {
          loss = "";
          throw Error("Fictional preparation loss");
        }
        return {
          uploadId,
          state,
          url: "https://storage.example.test/quarantine/fictional?signature=fictional",
          headers: {
            "Content-Type": "text/plain",
            "x-amz-meta-sha256": o.body!.sha256,
          },
        };
      }
      if (path.endsWith("/recovery"))
        return {
          committed: accepted,
          canRetry: !accepted,
          uploadId: accepted ? uploadId : null,
          state: accepted ? state : null,
        };
      if (path.endsWith("/complete")) {
        if (loss === "complete-before") {
          loss = "";
          throw Error("Fictional completion loss");
        }
        state = "clean";
        if (loss === "complete-after") {
          loss = "";
          throw Error("Fictional completion loss");
        }
        return record();
      }
      if (path.endsWith("/status")) {
        if (statusFailure) throw statusFailure;
        if (removed)
          throw new ApiFailure(
            404,
            "UPLOAD_NOT_FOUND",
            "Fictional attachment no longer available",
          );
        return record(path.split("/").at(-2));
      }
      if (path.endsWith("/remove")) {
        if (loss === "remove-before") {
          loss = "";
          throw Error("Fictional removal loss");
        }
        removed = true;
        if (loss === "remove-after") {
          loss = "";
          throw Error("Fictional removal loss");
        }
        return { removed: true };
      }
      throw Error("Unexpected fixture file operation");
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("Respondent attachment current context and original outcome recovery", () => {
  it("attaches only after the direct transfer, completion and clean scan, with no file stored in browser storage", async () => {
    const local = vi.spyOn(Storage.prototype, "setItem");
    render(<Harness />);
    choose();
    await screen.findByText("Ready for submission");
    expect(count).toBe(1);
    expect(calls("/prepare")).toHaveLength(1);
    expect(calls("/complete")).toHaveLength(1);
    expect(put).toHaveBeenCalledWith(
      expect.stringContaining("https://storage.example.test/"),
      expect.objectContaining({
        method: "PUT",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      }),
    );
    expect(changes).toHaveBeenLastCalledWith([uploadId]);
    expect(local).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("region", { name: "Unconfirmed file operation" }),
    ).toBeNull();
  });
  it.each([
    "prepare-before",
    "prepare-after",
    "put",
    "complete-before",
    "complete-after",
  ])(
    "recovers %s with original file metadata/key and one intent",
    async (mode) => {
      loss = mode;
      render(<Harness />);
      choose();
      await screen.findByRole("alert");
      const first = calls("/prepare")[0][1];
      expect(
        (
          screen.getByRole("button", {
            name: "Continue original upload",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(changes).not.toHaveBeenCalled();
      click("Check original file outcome");
      if (mode !== "complete-after") {
        await waitFor(() =>
          expect(
            (
              screen.getByRole("button", {
                name: "Continue original upload",
              }) as HTMLButtonElement
            ).disabled,
          ).toBe(false),
        );
        click("Continue original upload");
      }
      await screen.findByText("Ready for submission");
      expect(count).toBe(1);
      for (const [, options] of calls("/prepare")) {
        expect(options.body).toEqual(first.body);
        expect(options.idempotencyKey).toBe(first.idempotencyKey);
      }
      expect(calls("/recovery")[0][1]).toMatchObject({
        body: first.body,
        idempotencyKey: first.idempotencyKey,
      });
      expect(changes).toHaveBeenLastCalledWith([uploadId]);
      expect(calls("/prepare")).toHaveLength(mode === "complete-after" ? 1 : 2);
    },
  );
  it.each(["remove-before", "remove-after"])(
    "reconciles %s before permitting submission",
    async (mode) => {
      state = "clean";
      render(<Harness initial={[uploadId]} />);
      await screen.findByText("Ready for submission");
      loss = mode;
      click("Remove");
      await screen.findByRole("alert");
      click("Check removal status");
      if (mode === "remove-before") {
        await waitFor(() =>
          expect(
            (
              screen.getByRole("button", {
                name: "Retry removing this file",
              }) as HTMLButtonElement
            ).disabled,
          ).toBe(false),
        );
        click("Retry removing this file");
      }
      await waitFor(() =>
        expect(
          screen.queryByRole("region", { name: "Unconfirmed file operation" }),
        ).toBeNull(),
      );
      expect(changes).toHaveBeenLastCalledWith([]);
      expect(calls("/remove")).toHaveLength(mode === "remove-after" ? 1 : 2);
    },
  );
  it("retries only the failed attachment read, retaining its ID without falsely declaring readiness", async () => {
    statusFailure = Error("Fictional status outage");
    render(<Harness initial={[uploadId]} />);
    await screen.findByText("Current status unavailable");
    expect(screen.queryByText("Ready for submission")).toBeNull();
    expect(changes).not.toHaveBeenCalled();
    expect(busy).toHaveBeenLastCalledWith(true);
    state = "clean";
    statusFailure = undefined;
    click("Check status");
    await screen.findByText("Ready for submission");
    expect(calls("/status")).toHaveLength(2);
    expect(calls("/prepare")).toHaveLength(0);
    expect(busy).toHaveBeenLastCalledWith(false);
  });
  it.each(["expired", "rejected"] as const)(
    "excludes a currently %s file from the response and offers deliberate removal",
    async (condition) => {
      state = condition;
      render(<Harness initial={[uploadId]} />);
      await screen.findByText(
        condition === "expired" ? "Upload expired" : "Not accepted",
      );
      expect(changes).toHaveBeenLastCalledWith([]);
      expect(screen.queryByText("Ready for submission")).toBeNull();
      click("Remove");
      await waitFor(() =>
        expect(screen.queryByText("fictional.txt")).toBeNull(),
      );
    },
  );
  it.each([401, 403, 404])(
    "clears private file state and signals parent on current form denial %s",
    async (status) => {
      statusFailure = new ApiFailure(
        status,
        "NOT_FOUND",
        "Fictional form access denied",
      );
      render(<Harness initial={[uploadId]} />);
      await waitFor(() => expect(denied).toHaveBeenCalledTimes(1));
      expect(screen.queryByText("fictional.txt")).toBeNull();
      expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
      expect(changes).toHaveBeenLastCalledWith([]);
    },
  );
  it("treats an unavailable upload as a missing reference rather than claiming physical deletion", async () => {
    removed = true;
    render(<Harness initial={[uploadId]} />);
    await screen.findByText(/attachment is no longer available/);
    expect(denied).not.toHaveBeenCalled();
    expect(changes).toHaveBeenLastCalledWith([]);
    expect(screen.queryByText("Ready for submission")).toBeNull();
  });
  it.each(["wrong-id", "bad-state", "bad-scan", "bad-bytes"])(
    "refuses malformed %s status",
    async (variant) => {
      transport.mockResolvedValue({
        ...record(),
        ...(variant === "wrong-id"
          ? { uploadId: "other" }
          : variant === "bad-state"
            ? { state: "ready" }
            : variant === "bad-scan"
              ? { scanState: "safe" }
              : { bytes: -1 }),
      });
      render(<Harness initial={[uploadId]} />);
      await screen.findByText("Current status unavailable");
      expect(changes).not.toHaveBeenCalled();
      expect(screen.queryByText("Ready for submission")).toBeNull();
    },
  );
  it("does not auto-restart uncertain uploads on reconnect and requires another explicit inspection", async () => {
    loss = "prepare-after";
    render(<Harness />);
    choose();
    await screen.findByRole("alert");
    click("Check original file outcome");
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Continue original upload",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
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
    expect(
      (
        screen.getByRole("button", {
          name: "Continue original upload",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(calls("/prepare")).toHaveLength(1);
    expect(put).not.toHaveBeenCalled();
  });
  it("protects pending file work from duplicate events and cancels obsolete context callbacks", async () => {
    let finish!: (value: unknown) => void;
    transport.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<Harness />);
    choose();
    await waitFor(() => expect(calls("/prepare")).toHaveLength(1));
    choose();
    expect(calls("/prepare")).toHaveLength(1);
    const signal = calls("/prepare")[0][1].signal;
    view.rerender(
      <Harness
        scope={{
          ...context,
          versionId: "f1300000-0000-4000-8000-000000000004",
        }}
      />,
    );
    expect(signal.aborted).toBe(true);
    await act(async () => finish({ uploadId, state: "clean" }));
    expect(changes).not.toHaveBeenCalled();
    expect(names).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
  it("releases parent busy state and ignores a delayed direct transfer after unmount", async () => {
    let finish!: (value: unknown) => void;
    put.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const view = render(<Harness />);
    choose();
    await waitFor(() => expect(put).toHaveBeenCalled());
    view.unmount();
    expect(busy).toHaveBeenLastCalledWith(false);
    await act(async () => finish({ ok: true }));
    expect(calls("/complete")).toHaveLength(0);
    expect(changes).not.toHaveBeenCalled();
  });
  it("clears cached filenames and cancels pending work when the account session is cleared", async () => {
    state = "clean";
    render(<Harness initial={[uploadId]} />);
    await screen.findByText("Ready for submission");
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    expect(screen.queryByText("fictional.txt")).toBeNull();
    expect(changes).toHaveBeenLastCalledWith([]);
    expect(denied).toHaveBeenCalledTimes(1);
  });
  it("requires reviewed stopping and never attaches an unconfirmed file", async () => {
    loss = "prepare-after";
    render(<Harness />);
    choose();
    await screen.findByRole("alert");
    fireEvent.click(screen.getByText("Review stopping file recovery"));
    click("Stop tracking this file");
    expect(
      screen.queryByRole("region", { name: "Unconfirmed file operation" }),
    ).toBeNull();
    expect(changes).not.toHaveBeenCalled();
    expect(calls("/prepare")).toHaveLength(1);
  });
  it.each([
    ["payload.svg", "image/svg+xml", "safe"],
    ["fictional.txt", "text/plain", ""],
  ])(
    "rejects invalid %s before requesting a signed capability",
    async (name, mime, bytes) => {
      render(<Harness />);
      choose(name, mime, bytes);
      await screen.findByRole("alert");
      expect(transport).not.toHaveBeenCalled();
      expect(put).not.toHaveBeenCalled();
    },
  );
  it("retains every clean attachment in a selected multi-file batch", async () => {
    const ids = [uploadId, "f1300000-0000-4000-8000-000000000005"];
    let prepared = 0;
    const original = transport.getMockImplementation()!;
    transport.mockImplementation(
      async (path: string, options: Parameters<typeof original>[1]) => {
        if (path.endsWith("/prepare"))
          return {
            uploadId: ids[prepared++],
            state: "pending",
            url: "https://storage.example.test/quarantine/fictional",
            headers: {
              "Content-Type": "text/plain",
              "x-amz-meta-sha256": options.body!.sha256,
            },
          };
        return original(path, options);
      },
    );
    render(<Harness />);
    const files = ["first.txt", "second.txt"].map((name) => {
      const file = new File(["safe"], name, { type: "text/plain" });
      Object.defineProperty(file, "arrayBuffer", {
        value: async () => new TextEncoder().encode("safe").buffer,
      });
      return file;
    });
    fireEvent.change(screen.getByLabelText("Fictional attachment"), {
      target: { files },
    });
    await waitFor(() => expect(changes).toHaveBeenLastCalledWith(ids));
    expect(calls("/prepare")).toHaveLength(2);
    expect(calls("/complete")).toHaveLength(2);
  });
  it("requires another original inspection after a second transfer loss", async () => {
    loss = "put";
    render(<Harness />);
    choose();
    await screen.findByRole("alert");
    click("Check original file outcome");
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Continue original upload",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    loss = "put";
    click("Continue original upload");
    await screen.findByRole("alert");
    expect(
      (
        screen.getByRole("button", {
          name: "Continue original upload",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("preserves read-only existing attachment IDs without sending upload-proof requests", () => {
    render(<Harness initial={[uploadId]} readOnly />);
    expect(screen.getByText("Existing private attachment")).toBeTruthy();
    expect(transport).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).toBeNull();
    expect(changes).not.toHaveBeenCalled();
  });
});
