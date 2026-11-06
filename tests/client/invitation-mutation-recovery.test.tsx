// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TeamInvitations from "../../src/ui/teams/TeamInvitations";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, safety } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  safety: { request: vi.fn((action: () => void) => action()) },
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/hooks/useDraftGuard", () => ({
  useDraftGuard: vi.fn(),
  useNavigationSafety: () => safety,
}));
const invite = {
    id: "fictional-invitation",
    email: "fictional-invite@example.test",
    role: "member",
    status: "pending",
    expires_at: "2026-11-12T12:00:00Z",
    revision: 1,
    invited_by: "fictional-admin",
    last_sent_at: "2026-11-05T12:00:00Z",
  },
  root = "/admin/teams/fictional-team/invitations";
type Options = {
  method?: string;
  signal?: AbortSignal;
  body: Record<string, unknown>;
  idempotencyKey: string;
};
let current: typeof invite,
  write: (path: string, options: Options) => Promise<unknown>;
const writes = () => apiMock.mock.calls.filter(([, options]) => options.method);
beforeEach(() => {
  current = { ...invite };
  write = async () => ({ record: current });
  apiMock.mockReset().mockImplementation(async (path, options) =>
    options.method
      ? write(path, options)
      : path === root + "/" + invite.id
        ? { record: { ...current } }
        : {
            items: [{ ...current }],
            total: 21,
            actorId: "fictional-admin",
            canInviteOfficers: true,
          },
  );
  safety.request.mockReset().mockImplementation((action) => action());
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function review(action: "create" | "resend" | "revoke" = "create") {
  await screen.findByText(invite.email);
  if (action !== "create")
    fireEvent.click(
      screen.getByRole("button", {
        name: action === "resend" ? "Resend" : "Revoke",
        exact: true,
      }),
    );
  else
    fireEvent.change(screen.getByLabelText(/^Recipient email/), {
      target: { value: invite.email },
    });
  fireEvent.change(screen.getByLabelText(/^Confirm your own password/), {
    target: { value: "Fictional original proof" },
  });
  const save = screen.getByRole("button", {
    name:
      action === "create"
        ? "Queue private invitation"
        : "Confirm invitation change",
    exact: true,
  });
  fireEvent.click(save);
  return {
    dialog: screen.getByRole("dialog"),
    save,
    confirm: screen.getByRole("button", {
      name: "Confirm reviewed invitation change",
    }),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe("Reviewed private invitations", () => {
  it("keeps uncertain replay disabled after recheck failure and clears it if recheck access is denied", async () => {
    write = async () => {
      throw new TypeError("Fictional lost response");
    };
    render(<TeamInvitations teamId="fictional-team" />);
    fireEvent.click((await review()).confirm);
    await screen.findByRole("button", {
      name: "Retry original invitation operation",
    });
    const original = apiMock.getMockImplementation()!;
    let denial = false;
    apiMock.mockImplementation((path, options) =>
      path.includes("?email=")
        ? Promise.reject(
            new ApiFailure(
              denial ? 403 : 503,
              "UNAVAILABLE",
              "Fictional recheck unavailable",
            ),
          )
        : original(path, options),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck saved invitation values" }),
    );
    await screen.findByText("Fictional recheck unavailable");
    fireEvent.change(screen.getByLabelText(/^Current password for retry/), {
      target: { value: "Fictional fresh proof" },
    });
    expect(
      (
        screen.getByRole("button", {
          name: "Retry original invitation operation",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(writes()).toHaveLength(1);
    denial = true;
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck saved invitation values" }),
    );
    await screen.findByRole("button", { name: "Recheck invitation access" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByDisplayValue("Fictional fresh proof")).toBeNull();
    expect(writes()).toHaveLength(1);
  });
  it("reports the actual saved role when an existing pending invitation is retained", async () => {
    write = async () => ({ record: { ...current, role: "lead" } });
    render(<TeamInvitations teamId="fictional-team" />);
    fireEvent.click((await review()).confirm);
    await screen.findByText(/Current state: pending; team role: lead/);
    expect(writes()).toHaveLength(1);
  });
  it.each(["create", "resend", "revoke"] as const)(
    "names the %s recipient, membership role and consequence before any write",
    async (action) => {
      render(<TeamInvitations teamId="fictional-team" />);
      const { dialog } = await review(action);
      expect(dialog.textContent).toContain(invite.email);
      expect(dialog.textContent).toContain("Team membership role: member");
      expect(dialog.textContent).toContain(
        action === "create"
          ? "seven days"
          : action === "resend"
            ? "previous link stops working"
            : "membership remain",
      );
      expect(writes()).toHaveLength(0);
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Keep editing" }),
      );
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(writes()).toHaveLength(0);
    },
  );
  it("returns review focus to the actual submitter and preserves unsent input", async () => {
    render(<TeamInvitations teamId="fictional-team" />);
    const { dialog, save } = await review();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Keep editing" }),
    );
    await waitFor(() => expect(document.activeElement).toBe(save));
    expect(
      (screen.getByLabelText(/^Recipient email/) as HTMLInputElement).value,
    ).toBe(invite.email);
  });
  it("latches duplicate confirmations, freezes input and refuses pending Escape dismissal", async () => {
    const pending = deferred<unknown>();
    write = () => pending.promise;
    render(<TeamInvitations teamId="fictional-team" />);
    const { dialog, confirm } = await review();
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(writes()).toHaveLength(1);
    expect(
      (screen.getByLabelText(/^Recipient email/) as HTMLInputElement).matches(
        ":disabled",
      ),
    ).toBe(true);
    expect(
      within(dialog)
        .getByLabelText(/^Confirm your password again/)
        .matches(":disabled"),
    ).toBe(true);
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    await act(async () => pending.resolve({ record: current }));
    const receipt = await screen.findByText(
      /Invitation change confirmed by the server/,
    );
    await waitFor(() => expect(document.activeElement).toBe(receipt));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it.each(["create", "resend", "revoke"] as const)(
    "rechecks and explicitly replays an uncertain %s with the identical key/body and fresh proof",
    async (action) => {
      let first = true;
      write = async () => {
        if (first) {
          first = false;
          throw new TypeError("Fictional lost response");
        }
        return { record: current };
      };
      render(<TeamInvitations teamId="fictional-team" />);
      const { confirm } = await review(action);
      fireEvent.click(confirm);
      const retry = await screen.findByRole("button", {
        name: "Retry original invitation operation",
      });
      expect((retry as HTMLButtonElement).disabled).toBe(true);
      expect(
        (
          screen.getByLabelText(
            /^Current password for retry/,
          ) as HTMLInputElement
        ).value,
      ).toBe("");
      fireEvent.click(
        screen.getByRole("button", { name: "Recheck saved invitation values" }),
      );
      await screen.findByText("Inspect current saved invitation values", {
        exact: true,
      });
      expect(writes()).toHaveLength(1);
      expect(
        apiMock.mock.calls.some(
          ([path, options]) =>
            !options.method &&
            path ===
              root +
                (action === "create"
                  ? "?email=" + encodeURIComponent(invite.email)
                  : "/" + invite.id),
        ),
      ).toBe(true);
      fireEvent.change(screen.getByLabelText(/^Current password for retry/), {
        target: { value: "Fictional fresh proof" },
      });
      fireEvent.click(retry);
      await screen.findByText(/Invitation change confirmed by the server/);
      expect(writes()).toHaveLength(2);
      expect(writes()[1][1].idempotencyKey).toBe(writes()[0][1].idempotencyKey);
      const { currentPassword: _first, ...original } = writes()[0][1].body;
      const { currentPassword: _second, ...replayed } = writes()[1][1].body;
      expect(replayed).toEqual(original);
      expect(writes()[1][1].body.currentPassword).toBe("Fictional fresh proof");
    },
  );
  it("refuses expired uncertain retries and reviews abandoning without another write", async () => {
    write = async () => {
      throw new TypeError("Fictional lost response");
    };
    render(<TeamInvitations teamId="fictional-team" />);
    fireEvent.click((await review()).confirm);
    await screen.findByRole("button", {
      name: "Retry original invitation operation",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck saved invitation values" }),
    );
    await screen.findByText("Inspect current saved invitation values", {
      exact: true,
    });
    fireEvent.change(screen.getByLabelText(/^Current password for retry/), {
      target: { value: "Fictional fresh proof" },
    });
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 47 * 60 * 60 * 1000);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Retry original invitation operation",
      }),
    );
    await screen.findByText(/safe retry window ended/);
    expect(writes()).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Review abandoning invitation recovery",
      }),
    );
    expect(screen.getByRole("dialog").textContent).toContain(
      "No accepted invitation change is reversed",
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Abandon invitation recovery",
        exact: true,
      }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      (screen.getByLabelText(/^Recipient email/) as HTMLInputElement).value,
    ).toBe("");
    expect(writes()).toHaveLength(1);
  });
  it("allows inline correction of a rejected password without discarding the reviewed intent", async () => {
    let first = true;
    write = async () => {
      if (first) {
        first = false;
        throw new ApiFailure(
          403,
          "PASSWORD_CONFIRMATION_FAILED",
          "Fictional password denied",
        );
      }
      return { record: current };
    };
    render(<TeamInvitations teamId="fictional-team" />);
    const { confirm } = await review();
    fireEvent.click(confirm);
    await screen.findByText("Fictional password denied");
    const proof = screen.getByLabelText(
      /^Confirm your password again/,
    ) as HTMLInputElement;
    expect(proof.value).toBe("");
    expect(proof.getAttribute("aria-invalid")).toBe("true");
    expect(proof.getAttribute("aria-describedby")).toBe("invite-proof-error");
    fireEvent.change(proof, { target: { value: "Fictional corrected proof" } });
    fireEvent.click(confirm);
    await screen.findByText(/Invitation change confirmed by the server/);
    expect(writes()[1][1].idempotencyKey).toBe(writes()[0][1].idempotencyKey);
  });
  it.each([401, 403, 404])(
    "clears reviewed fields on write denial %s and focuses the access recheck",
    async (status) => {
      write = async () => {
        throw new ApiFailure(status, "DENIED", "Fictional denied write");
      };
      render(<TeamInvitations teamId="fictional-team" />);
      fireEvent.click((await review()).confirm);
      const button = await screen.findByRole("button", {
        name: "Recheck invitation access",
      });
      await waitFor(() => expect(document.activeElement).toBe(button));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByLabelText(/^Recipient email/)).toBeNull();
      expect(screen.queryByText(invite.email, { exact: true })).toBeNull();
    },
  );
  it("rechecks a conflict without blindly retrying and reviews stale-action closing", async () => {
    write = async () => {
      throw new ApiFailure(409, "CONFLICT", "Fictional revision conflict");
    };
    render(<TeamInvitations teamId="fictional-team" />);
    fireEvent.click((await review("revoke")).confirm);
    await screen.findByText(/changed before this operation was accepted/);
    expect(
      screen.queryByRole("button", {
        name: "Retry original invitation operation",
      }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reload invitations" }));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Reload invitations",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    safety.request.mockImplementation(() => {});
    fireEvent.click(
      screen.getByRole("button", {
        name: "Review closing stale invitation action",
      }),
    );
    expect(safety.request).toHaveBeenCalledTimes(1);
    expect(writes()).toHaveLength(1);
  });
  it("cancels pending write transport on session invalidation and ignores its late receipt", async () => {
    const pending = deferred<unknown>();
    write = () => pending.promise;
    render(<TeamInvitations teamId="fictional-team" />);
    fireEvent.click((await review()).confirm);
    const signal = writes()[0][1].signal;
    fireEvent(window, new Event("gdg:session-cleared"));
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve({ record: current }));
    expect(screen.queryByText(/Invitation change confirmed/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Recheck invitation access" }),
    ).toBeTruthy();
  });
  it("does not commit an offline review or automatically send on reconnection", async () => {
    render(<TeamInvitations teamId="fictional-team" />);
    const { confirm } = await review();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    fireEvent(window, new Event("offline"));
    fireEvent.click(confirm);
    expect(writes()).toHaveLength(0);
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    fireEvent(window, new Event("online"));
    expect(writes()).toHaveLength(0);
  });
});
