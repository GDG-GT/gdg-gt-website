// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TeamInvitations from "../../src/ui/teams/TeamInvitations";
import TeamAnnouncements from "../../src/ui/teams/TeamAnnouncements";
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/hooks/useDraftGuard", () => ({
  useDraftGuard: vi.fn(),
  useNavigationSafety: () => undefined,
}));
beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockResolvedValue({
    items: [],
    total: 0,
    actorId: "fictional-officer",
    canInviteOfficers: true,
    canManage: true,
  });
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("retains actual invitation inputs while a parent read pauses them and rejects direct submit", async () => {
  const panel = (disabled: boolean) => (
    <TeamInvitations teamId="fictional-team" disabled={disabled} />
  );
  const view = render(panel(false));
  const email = (await screen.findByLabelText(
    /^Recipient email/,
  )) as HTMLInputElement;
  fireEvent.change(email, {
    target: { value: "fictional-invite@example.test" },
  });
  view.rerender(panel(true));
  fireEvent.submit(email.closest("form")!);
  expect(email.value).toBe("fictional-invite@example.test");
  expect(email.matches(":disabled")).toBe(true);
  expect(apiMock.mock.calls.every(([, options]) => !options.method)).toBe(true);
  view.rerender(panel(false));
  expect(email.value).toBe("fictional-invite@example.test");
  expect(email.matches(":disabled")).toBe(false);
});
it("retains actual announcement input while a parent read pauses it and rejects direct submit", async () => {
  const panel = (disabled: boolean) => (
    <TeamAnnouncements teamId="fictional-team" canManage disabled={disabled} />
  );
  const view = render(panel(false));
  await screen.findByText(/No announcements/);
  fireEvent.click(screen.getByRole("button", { name: "Write announcement" }));
  const title = screen.getByLabelText(
    /^Announcement title/,
  ) as HTMLInputElement;
  fireEvent.change(title, {
    target: { value: "Fictional retained announcement" },
  });
  view.rerender(panel(true));
  fireEvent.submit(title.closest("form")!);
  expect(title.value).toBe("Fictional retained announcement");
  expect(title.matches(":disabled")).toBe(true);
  expect(apiMock.mock.calls.every(([, options]) => !options.method)).toBe(true);
});
it("refuses invitation submission while offline before a parent render catches up", async () => {
  render(<TeamInvitations teamId="fictional-team" />);
  const email = await screen.findByLabelText(/^Recipient email/);
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: false,
  });
  fireEvent.submit(email.closest("form")!);
  expect(apiMock.mock.calls.every(([, options]) => !options.method)).toBe(true);
});
