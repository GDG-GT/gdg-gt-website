// @vitest-environment jsdom
import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import Leaderboard from "../../src/ui/rewards/Leaderboard";
import RewardsWorkspace from "../../src/ui/rewards/RewardsWorkspace";
import NfcControls from "../../src/ui/rewards/NfcControls";
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ isSuperAdmin: true }),
}));
const member = {
  id: "b2100000-0000-4000-8000-000000000003",
  name: "Fictional Member",
  email: "member@example.test",
  points: 25,
};
const activity = {
  id: "b2100000-0000-4000-8000-000000000004",
  title: "Fictional workshop",
  points: 10,
  opens_at: "2020-01-01T00:00:00Z",
  closes_at: "2099-01-01T00:00:00Z",
  revision: 1,
};
const inventory = {
  members: [member],
  selectedMember: member,
  total: 1,
  rules: [],
  activities: [activity],
  perks: [],
  credentials: [],
  ledger: [],
  claims: [],
};
const board = { items: [], total: 0, perks: [], ssoAvailable: false };
const mount = (element: React.ReactNode, path = "/leaderboard") =>
  render(<MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>);
beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((path) =>
    path === "/rewards/me"
      ? Promise.reject(new Error("Sign in required"))
      : Promise.resolve(board),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("Member rewards interactions and recovery", () => {
  it("offers QR Wallet downloads only for active Wallet credentials", async () => {
    const wallet = {
      id: member.id,
      label: "iPhone membership",
      kind: "wallet",
      revoked_at: null,
    };
    apiMock.mockResolvedValue({
      ...inventory,
      walletAvailable: true,
      walletNfcAvailable: false,
      credentials: [
        wallet,
        {
          ...wallet,
          id: activity.id,
          label: "Old pass",
          revoked_at: "2026-01-01",
        },
      ],
    });
    mount(<RewardsWorkspace />, "/admin/rewards");
    fireEvent.click(
      await screen.findByRole("button", { name: /Fictional Member.*25 pts/ }),
    );
    expect(
      await screen.findByRole("option", { name: "Wallet pass QR" }),
    ).toHaveProperty("disabled", false);
    expect(
      screen
        .getByRole("link", {
          name: "Download Apple Wallet pass for iPhone membership",
        })
        .getAttribute("href"),
    ).toBe("/api/v1/admin/rewards/wallet/" + member.id);
    expect(
      screen.queryByRole("link", { name: "Download Apple Wallet pass for Old pass" }),
    ).toBeNull();
    expect(screen.queryByText(/Your X100/)).toBeNull();
  });
  it("shows a direct pass download after Wallet issuance instead of NFC programming", async () => {
    apiMock.mockImplementation((path) =>
      Promise.resolve(
        path === "/admin/rewards/credential"
          ? {
              id: activity.id,
              credential: "W".repeat(43),
              url: "https://gdggt.dev/tap#card=" + "W".repeat(43),
            }
          : { ...inventory, walletAvailable: true },
      ),
    );
    mount(<RewardsWorkspace />, "/admin/rewards");
    fireEvent.click(
      await screen.findByRole("button", { name: /Fictional Member.*25 pts/ }),
    );
    fireEvent.change(
      await screen.findByRole("textbox", { name: "Credential label" }),
      { target: { value: "iPhone pass" } },
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Credential type" }),
      { target: { value: "wallet" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Issue credential" }));
    await screen.findByRole("heading", { name: "Wallet pass ready" });
    expect(
      screen
        .getByRole("link", { name: "Download Apple Wallet pass" })
        .getAttribute("href"),
    ).toBe("/api/v1/admin/rewards/wallet/" + activity.id);
    expect(screen.queryByRole("button", { name: "Copy NFC URL" })).toBeNull();
    expect(apiMock).toHaveBeenCalledWith(
      "/admin/rewards/credential",
      expect.objectContaining({
        body: { memberId: member.id, kind: "wallet", label: "iPhone pass" },
      }),
    );
  });
  it("keeps public rankings concise and campus sign-in unavailable until configured", async () => {
    mount(<Leaderboard />, "/leaderboard/member");
    expect(
      await screen.findByRole("button", { name: "Sign in with Georgia Tech" }),
    ).toHaveProperty("disabled", true);
    expect(
      await screen.findByText("Georgia Tech sign-in is coming soon."),
    ).toBeTruthy();
    expect(screen.queryByText("All-time points")).toBeNull();
  });
  it("shows live rankings and recovers from a failed public read", async () => {
    apiMock.mockRejectedValueOnce(new Error("Temporary connection failure"));
    mount(<Leaderboard />);
    await screen.findByText("Temporary connection failure");
    apiMock.mockResolvedValue({
      ...board,
      items: [{ alias: "Fictional Builder", points: 20, rank: 1 }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Fictional Builder");
    expect(screen.queryByText(/Members choose whether/)).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "GDG@GT member leaderboard" })
        .getAttribute("href"),
    ).toBe("/leaderboard");
  });
  it("rejects an unexpected sign-in redirect destination", async () => {
    apiMock.mockImplementation((path) =>
      Promise.resolve(
        path === "/rewards/login"
          ? { url: "https://unexpected.example.test/" }
          : path === "/rewards/me"
            ? Promise.reject(new Error("Sign in required"))
            : { ...board, ssoAvailable: true },
      ),
    );
    mount(<Leaderboard />, "/leaderboard/member");
    const button = await screen.findByRole("button", {
      name: "Sign in with Georgia Tech",
    });
    await waitFor(() => expect(button).toHaveProperty("disabled", false));
    fireEvent.click(button);
    await screen.findByText(
      "Campus sign-in returned an unexpected destination.",
    );
  });
  it("saves member visibility and requests a perk using the member CSRF token", async () => {
    const perk = {
      id: "b2100000-0000-4000-8000-000000000006",
      title: "Fictional merch",
      description: "Fictional stock",
      threshold: 10,
    };
    const me = {
      ...member,
      alias: "",
      isPublic: false,
      csrf: "fictional-csrf",
      ledger: [],
      claims: [],
    };
    apiMock.mockImplementation((path) =>
      Promise.resolve(
        path === "/rewards/me" ? me : { ...board, perks: [perk] },
      ),
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { saved: true } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    mount(<Leaderboard />, "/leaderboard/member");
    await screen.findByRole("heading", { name: "Hi, Fictional Member" });
    fireEvent.change(screen.getByRole("textbox", { name: /Display name/ }), {
      target: { value: "Fictional Builder" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save profile" }),
      ).toHaveProperty("disabled", true),
    );
    fireEvent.click(screen.getByRole("button", { name: "Request perk" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "/api/v1/rewards/profile",
      "/api/v1/rewards/claim",
    ]);
    expect(
      fetchMock.mock.calls.every(
        (c) =>
          c[1].headers["X-Rewards-CSRF"] === "fictional-csrf" &&
          !!c[1].headers["Idempotency-Key"],
      ),
    ).toBe(true);
  });
  it("reviews awards before writing and preserves the retry key after a lost response", async () => {
    let attempts = 0;
    apiMock.mockImplementation((path, options) => {
      if (path === "/admin/rewards/award") {
        if (++attempts === 1)
          return Promise.reject(new TypeError("Lost response"));
        return Promise.resolve({ points: 10 });
      }
      return Promise.resolve(inventory);
    });
    mount(<RewardsWorkspace />, "/admin/rewards");
    await screen.findByRole("button", { name: /Fictional Member.*25 pts/ });
    fireEvent.click(
      screen.getByRole("button", { name: /Fictional Member.*25 pts/ }),
    );
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Check-in activity" }),
      { target: { value: activity.id } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Review check-in award" }),
    );
    expect(apiMock.mock.calls.filter((c) => c[1]?.method)).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));
    await screen.findByRole("button", { name: "Retry same request" });
    fireEvent.click(screen.getByRole("button", { name: "Retry same request" }));
    await screen.findByText("Saved. The current records are shown below.");
    const writes = apiMock.mock.calls.filter(
      (c) => c[0] === "/admin/rewards/award",
    );
    expect(writes).toHaveLength(2);
    expect(writes[0][1].idempotencyKey).toBe(writes[1][1].idempotencyKey);
  });
  it("switches to scanner guidance and refuses unrelated credentials", async () => {
    apiMock.mockResolvedValue(inventory);
    mount(<RewardsWorkspace />, "/admin/rewards");
    await screen.findByRole("button", { name: /Fictional Member.*25 pts/ });
    fireEvent.click(screen.getByRole("button", { name: "Check-in scanner" }));
    expect(screen.getByText(/Use GDG Workspace build9 or later/)).toBeTruthy();
    fireEvent.change(
      screen.getByRole("textbox", { name: /Credential link or code/ }),
      { target: { value: "https://unrelated.example.test/" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Read credential" }));
    await screen.findByText("This is not a GDG member credential.");
    expect(apiMock.mock.calls.some((c) => c[0].endsWith("/resolve"))).toBe(
      false,
    );
  });
  it("resolves compact credentials without navigating to untrusted tag content", async () => {
    const onRead = vi.fn();
    mount(<NfcControls onRead={onRead} />);
    fireEvent.change(
      screen.getByRole("textbox", { name: /Credential link or code/ }),
      { target: { value: "R".repeat(43) } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Read credential" }));
    expect(onRead).toHaveBeenCalledWith("R".repeat(43));
  });
});
