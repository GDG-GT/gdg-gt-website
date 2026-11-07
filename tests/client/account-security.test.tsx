// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AccountSecurity from "../../src/ui/users/AccountSecurity";
import OperationsWorkspace from "../../src/ui/OperationsWorkspace";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, actor } = vi.hoisted(() => ({ apiMock: vi.fn(), actor: { id: "fictional-owner", role: "super_admin" } }));
vi.mock("@/lib/api", async (original) => ({ ...(await original<typeof import("../../src/lib/api")>()), api: apiMock }));
vi.mock("@/contexts/AdminContext", () => ({ useAdmin: () => ({ currentAdmin: actor }) }));
vi.mock("@/hooks/useDraftGuard", () => ({ useDraftGuard: vi.fn() }));
const security = { version: 7, rotatedAt: "2026-11-01T12:00:00Z", checkedAt: "2026-11-07T12:00:00Z", activeAccounts: 3, activeSessions: 4, lockedAccounts: 1, setupRequired: 2 };
const operations = { checkedAt: security.checkedAt, lastEvaluatedAt: security.checkedAt, installedAt: security.rotatedAt, alerts: [], rateAggregates: [], jobs: [{ job_name: "Fictional private job", state: "completed", started_at: security.checkedAt, counts: { done: 2 } }] };
const mount = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);
beforeEach(() => { apiMock.mockReset(); actor.role = "super_admin"; Object.defineProperty(navigator, "onLine", { configurable: true, value: true }); apiMock.mockImplementation((path) => path === "/admin/operations" ? Promise.resolve(operations) : Promise.resolve(security)); });
afterEach(cleanup);
async function review() {
  fireEvent.click(screen.getByText("Account security"));
  await screen.findByRole("button", { name: "Rotate gate code" });
  await waitFor(() => expect((screen.getByRole("button", { name: "Rotate gate code" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Rotate gate code" }));
  fireEvent.change(screen.getByLabelText(/^New gate code/), { target: { value: "Fictional gate code at least twenty four" } });
  fireEvent.change(screen.getByLabelText("Repeat new gate code"), { target: { value: "Fictional gate code at least twenty four" } });
  fireEvent.click(screen.getByRole("button", { name: "Review gate rotation" }));
  fireEvent.change(screen.getByLabelText("Your current password"), { target: { value: "Fictional password proof" } });
  fireEvent.change(screen.getByLabelText("Type ROTATE GATE to confirm"), { target: { value: "ROTATE GATE" } });
}
describe("security controls and private operational recovery", () => {
  it("hides all security controls from an ordinary Admin", () => { actor.role = "admin"; mount(<AccountSecurity />); expect(screen.queryByRole("heading")).toBeNull(); expect(apiMock).not.toHaveBeenCalled(); });
  it("requires a consequence review and typed confirmation before one rotation", async () => {
    apiMock.mockImplementation((path, options) => options?.method ? Promise.resolve({ rotated: true, version: 8 }) : Promise.resolve(security));
    mount(<AccountSecurity />); await review(); expect(apiMock.mock.calls.filter(([, o]) => o?.method)).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirm gate rotation" })); await screen.findByText(/Gate rotated\./);
    const writes = apiMock.mock.calls.filter(([, o]) => o?.method); expect(writes).toHaveLength(1);
    expect(writes[0][1].body).toMatchObject({ expectedVersion: 7, currentPassword: "Fictional password proof", confirmation: "ROTATE GATE" });
    expect(screen.queryByLabelText(/^New gate code/)).toBeNull();
  });
  it("checks a dropped rotation result without sending again", async () => {
    apiMock.mockImplementation((path, options) => options?.method ? Promise.reject(new Error("Fictional dropped response")) : path.includes("?key=") ? Promise.resolve({ committed: true, version: 8 }) : Promise.resolve(security));
    mount(<AccountSecurity />); await review(); fireEvent.click(screen.getByRole("button", { name: "Confirm gate rotation" }));
    await screen.findByText(/rotation result is unconfirmed/); expect((screen.getByLabelText("Your current password") as HTMLInputElement).value).toBe("");
    // Collapsing this disclosure must not discard an uncertain operation.
    fireEvent.click(screen.getByText("Account security"));
    fireEvent.click(screen.getByText("Account security"));
    fireEvent.click(screen.getByRole("button", { name: "Check original rotation result" })); await screen.findByText(/original rotation completed/);
    expect(apiMock.mock.calls.filter(([, o]) => o?.method)).toHaveLength(1);
  });
  it("permits identical explicit retry only after rechecking and fresh password entry", async () => {
    let writes = 0;
    apiMock.mockImplementation((path, options) => options?.method ? ++writes === 1 ? Promise.reject(new Error("Fictional dropped request")) : Promise.resolve({ rotated: true, version: 8 }) : path.includes("?key=") ? Promise.resolve({ committed: false, version: 7 }) : Promise.resolve(security));
    mount(<AccountSecurity />); await review(); fireEvent.click(screen.getByRole("button", { name: "Confirm gate rotation" })); await screen.findByText(/rotation result is unconfirmed/);
    expect(screen.queryByRole("button", { name: "Retry reviewed rotation" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Check original rotation result" })); const retry = await screen.findByRole("button", { name: "Retry reviewed rotation" }); expect((retry as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Your current password"), { target: { value: "Fresh fictional password" } }); fireEvent.click(retry); await screen.findByText(/Gate rotated\./);
    const calls = apiMock.mock.calls.filter(([, o]) => o?.method); expect(calls).toHaveLength(2); expect(calls[0][1].idempotencyKey).toBe(calls[1][1].idempotencyKey); expect(calls[0][1].body.code).toBe(calls[1][1].body.code);
  });
  it("clears protected security data and entered secrets after current denial", async () => {
    mount(<AccountSecurity />); await review(); apiMock.mockRejectedValue(new ApiFailure(403, "FORBIDDEN", "Fictional denied"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh security status" })); await screen.findByText("Fictional denied");
    await waitFor(() => expect(screen.queryByLabelText("Your current password")).toBeNull()); expect(screen.queryByText("Active accounts")).toBeNull();
  });
  it("withholds previous operational data after current permission denial", async () => {
    mount(<OperationsWorkspace />); await screen.findByText("Fictional private job"); apiMock.mockRejectedValue(new ApiFailure(403, "FORBIDDEN", "Fictional current denial"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" })); await screen.findByRole("alert"); expect(screen.queryByText("Fictional private job")).toBeNull();
  });
  it("retains a clearly stale operational snapshot on temporary outage and supports explicit retry", async () => {
    mount(<OperationsWorkspace />); await screen.findByText("Fictional private job"); apiMock.mockRejectedValue(new Error("Fictional outage"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" })); await screen.findByRole("alert"); expect(screen.getByText("Fictional private job")).toBeTruthy();
    apiMock.mockResolvedValue({ ...operations, jobs: [] }); fireEvent.click(screen.getByRole("button", { name: "Refresh status" })); await waitFor(() => expect(screen.queryByText("Fictional private job")).toBeNull());
  });
});
