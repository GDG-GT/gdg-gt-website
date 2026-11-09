// @vitest-environment jsdom
import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CheckInScanner from "../../src/ui/rewards/CheckInScanner";
import { ApiFailure } from "../../src/lib/api";
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: { id: "fictional-admin" } }),
}));
vi.mock("@/hooks/useDraftGuard", () => ({ useDraftGuard: () => {} }));
vi.mock("../../src/ui/rewards/NfcControls", () => ({
  default: ({ onRead }: { onRead: (token: string) => Promise<void> }) => (
    <button onClick={() => void onRead("A".repeat(43))}>
      Scan fictional member
    </button>
  ),
}));
const activity = {
  id: "b2100000-0000-4000-8000-000000000001",
  title: "Fictional workshop",
  points: 10,
  opens_at: "2020-01-01T00:00:00Z",
  closes_at: "2099-01-01T00:00:00Z",
};
const member = {
  id: "b2100000-0000-4000-8000-000000000002",
  name: "Fictional Member",
  email: "fixture@example.test",
  points: 0,
  credentialId: "b2100000-0000-4000-8000-000000000003",
};
beforeEach(() => {
  apiMock.mockReset();
  sessionStorage.clear();
  apiMock.mockImplementation(async (path: string) =>
    path.endsWith("/resolve") ? member : { id: "saved" },
  );
});
afterEach(cleanup);
function setup() {
  const manual = vi.fn(async () => {});
  render(
    <CheckInScanner
      activities={[activity]}
      rules={[]}
      refresh={async () => {}}
      manual={manual}
    />,
  );
  return manual;
}
function arm() {
  fireEvent.change(
    screen.getByRole("combobox", { name: "Activity for this scanner" }),
    { target: { value: activity.id } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Start automatic check-in" }),
  );
}
it("requires an explicit armed session, then awards the selected activity without another confirmation", async () => {
  const manual = setup();
  fireEvent.click(
    screen.getByRole("button", { name: "Scan fictional member" }),
  );
  await waitFor(() => expect(manual).toHaveBeenCalledTimes(1));
  expect(apiMock).not.toHaveBeenCalled();
  arm();
  fireEvent.click(
    screen.getByRole("button", { name: "Scan fictional member" }),
  );
  await waitFor(() =>
    expect(apiMock).toHaveBeenCalledWith(
      "/admin/rewards/award",
      expect.objectContaining({
        body: {
          memberId: member.id,
          activityId: activity.id,
          credentialId: member.credentialId,
        },
      }),
    ),
  );
  await screen.findByText(/Fictional Member checked in/);
  expect(screen.queryByRole("button", { name: "Confirm change" })).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Stop automatic check-in" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Scan fictional member" }),
  );
  await waitFor(() => expect(manual).toHaveBeenCalledTimes(2));
});
it("suspends after an unknown award result and retries with the exact same identity", async () => {
  let writes = 0;
  apiMock.mockImplementation(async (path: string) => {
    if (path.endsWith("/resolve")) return member;
    if (path.endsWith("/award") && ++writes === 1)
      throw new ApiFailure(503, "TEMPORARILY_UNAVAILABLE", "Result unknown");
    return { id: "saved" };
  });
  setup();
  arm();
  fireEvent.click(
    screen.getByRole("button", { name: "Scan fictional member" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Retry same check-in" }),
  );
  await screen.findByText(/Fictional Member checked in/);
  const awards = apiMock.mock.calls.filter(([path]) => path.endsWith("/award"));
  expect(awards).toHaveLength(2);
  expect(awards[0][1]).toEqual(awards[1][1]);
});
it("reports repeat check-ins without awarding a second balance change", async () => {
  apiMock.mockImplementation(async (path: string) => {
    if (path.endsWith("/resolve")) return member;
    throw new ApiFailure(409, "DUPLICATE", "Duplicate");
  });
  setup();
  arm();
  fireEvent.click(
    screen.getByRole("button", { name: "Scan fictional member" }),
  );
  await screen.findByText(/already checked in/);
  expect(
    screen.queryByRole("button", { name: "Retry same check-in" }),
  ).toBeNull();
});
it("creates a points category and activity directly, reusing the rule and request after a lost activity response", async () => {
  let activities = 0;
  apiMock.mockImplementation(async (path: string) => {
    if (path.endsWith("/rule")) return { id: "fictional-new-rule" };
    if (path.endsWith("/activity") && ++activities === 1)
      throw new ApiFailure(
        503,
        "TEMPORARILY_UNAVAILABLE",
        "Unknown activity result",
      );
    return { id: "fictional-new-activity" };
  });
  setup();
  fireEvent.click(
    screen.getByRole("button", { name: "Create check-in activity" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Activity title" }), {
    target: { value: "Fictional check-in" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Rule name" }), {
    target: { value: "Fictional attendance" },
  });
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "Points per check-in" }),
    { target: { value: "15" } },
  );
  fireEvent.change(screen.getByLabelText("Opens at"), {
    target: { value: "2026-11-09T12:00" },
  });
  fireEvent.change(screen.getByLabelText(/^Closes at/), {
    target: { value: "2026-11-09T14:00" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Create activity", exact: true }),
  );
  await screen.findByRole("alert");
  fireEvent.click(
    screen.getByRole("button", { name: "Create activity", exact: true }),
  );
  await screen.findByText(
    "Activity created. Start automatic check-in when ready.",
  );
  expect(apiMock.mock.calls.filter(([p]) => p.endsWith("/rule"))).toHaveLength(
    1,
  );
  const writes = apiMock.mock.calls.filter(([p]) => p.endsWith("/activity"));
  expect(writes).toHaveLength(2);
  expect(writes[0][1]).toEqual(writes[1][1]);
  expect(writes[0][1].body.ruleId).toBe("fictional-new-rule");
});
