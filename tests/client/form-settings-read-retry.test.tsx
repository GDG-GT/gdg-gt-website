// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DeliveryPanel from "../../src/ui/forms/DeliveryPanel";
import PrivacyPanel from "../../src/ui/forms/PrivacyPanel";
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/hooks/useDraftGuard", () => ({
  useDraftGuard: vi.fn(),
  useNavigationSafety: () => ({ request: (run: () => void) => run() }),
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({
    currentAdmin: { id: "fictional-settings-reader", role: "admin" },
  }),
}));
vi.mock("@/contexts/ContentContext", () => ({ useContent: () => ({}) }));
const delivery = {
  formRevision: 1,
  revision: 2,
  matchesDraft: true,
  editable: true,
  reviewedAt: null,
  receipts: false,
  receiptAnswers: false,
  notificationUsers: [],
  chapterInbox: false,
  notificationAnswers: false,
  canReviewAnswers: true,
  mailReady: true,
  chapterInboxAvailable: true,
  eligible: [],
  reference: "FORM fictional-form",
};
const privacy = {
  formId: "fictional-form",
  revision: 3,
  held: false,
  reason: "",
  draftDays: 7,
  canRelease: true,
  totalResponses: 0,
  heldResponses: 0,
  dueResponses: 0,
  nextExpiry: null,
  pendingFiles: 0,
};
const callback = () => {};
const components = {
  delivery: () => (
    <DeliveryPanel
      formId="fictional-form"
      saved
      receiptSetting={false}
      access="public"
      onStateChange={callback}
    />
  ),
  retention: () => (
    <PrivacyPanel
      formId="fictional-form"
      onStateChange={callback}
      onSaved={callback}
    />
  ),
};
beforeEach(() => {
  apiMock.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it.each(["delivery", "retention"] as const)(
  "loads %s with a named skeleton",
  (kind) => {
    apiMock.mockReturnValue(new Promise(() => {}));
    render(
      <main id="workspace-content" tabIndex={-1}>
        {components[kind]()}
      </main>,
    );
    expect(
      screen
        .getByRole("status", { name: `Loading ${kind} settings` })
        .querySelector(".gt-skeleton"),
    ).toBeTruthy();
    expect(apiMock.mock.calls.every(([, options]) => !!options.signal)).toBe(
      true,
    );
  },
);
it.each(["delivery", "retention"] as const)(
  "retries failed %s reads without a write or leaving the panel",
  async (kind) => {
    apiMock.mockRejectedValue(Error("Fictional settings connection lost"));
    render(
      <main id="workspace-content" tabIndex={-1}>
        {components[kind]()}
      </main>,
    );
    await screen.findByText("Fictional settings connection lost");
    apiMock.mockResolvedValue(kind === "delivery" ? delivery : privacy);
    fireEvent.click(
      screen.getByRole("button", { name: `Retry ${kind} settings` }),
    );
    if (kind === "delivery") await screen.findByText("Chapter notifications");
    else await screen.findByLabelText(/Private operational reason/);
    expect(apiMock.mock.calls.every(([, options]) => !options.method)).toBe(
      true,
    );
    expect(document.activeElement?.id).toBe("workspace-content");
  },
);
it.each(["delivery", "retention"] as const)(
  "aborts replaced %s reads and suppresses results after unmount",
  async (kind) => {
    apiMock.mockReturnValue(new Promise(() => {}));
    const page = render(<main>{components[kind]()}</main>);
    const signal = apiMock.mock.calls[0][1].signal as AbortSignal;
    page.unmount();
    await waitFor(() => expect(signal.aborted).toBe(true));
  },
);
