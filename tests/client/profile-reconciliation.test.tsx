// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ProfileReconcileDialog from "../../src/ui/content/ProfileReconcileDialog";
import { ApiFailure } from "../../src/lib/api";
const { transport } = vi.hoisted(() => ({ transport: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({ ...(await original<typeof import("../../src/lib/api")>()), api: transport }));
vi.mock("@/hooks/useDraftGuard", () => ({ useDraftGuard: vi.fn() }));
const keep = "f1480000-0000-4000-8000-000000000001", draft = "f1480000-0000-4000-8000-000000000002";
const profiles = [
  { id: keep, name: "Fictional Owner", role: "President", revision: 3, published: true, accountLinked: true, memberLinked: false },
  { id: draft, name: "Fictional Owner", role: "Founder", revision: 1, published: false, accountLinked: false, memberLinked: true },
];
const result = { record: { id: keep, name: "Fictional Owner", is_active: true }, archived: 1 };
const saved = vi.fn(), closed = vi.fn();
const writes = () => transport.mock.calls.filter(([, o]) => o?.method === "POST");
function mount() { render(<ProfileReconcileDialog id={draft} onClose={closed} onSaved={saved} />); }
beforeEach(() => {
  saved.mockReset(); closed.mockReset(); transport.mockReset();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  transport.mockImplementation(async (_path: string, options?: { method?: string }) => options?.method ? result : { email: "fictional-owner@example.test", profiles });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function acknowledge() {
  fireEvent.click(await screen.findByRole("checkbox", { name: "Keep Fictional Owner (Published) and archive the other 1 profile." }));
}
it("defaults to the published identity and submits an explicit versioned review without exposing IDs", async () => {
  mount(); await acknowledge();
  expect((screen.getByRole("radio", { name: /President/ }) as HTMLInputElement).checked).toBe(true);
  expect(document.body.textContent).not.toContain(keep);
  fireEvent.click(screen.getByRole("button", { name: "Confirm consolidation" }));
  await waitFor(() => expect(saved).toHaveBeenCalledWith(result));
  expect(writes()[0][1].body).toEqual({ action: "reconcile", keepId: keep, profiles: profiles.map(({ id, revision }) => ({ id, revision })) });
});
it("requires a new acknowledgement when choosing a different profile", async () => {
  mount(); await acknowledge();
  fireEvent.click(screen.getByRole("radio", { name: /Founder/ }));
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  expect((screen.getByRole("button", { name: "Confirm consolidation" }) as HTMLButtonElement).disabled).toBe(true);
});
it("retries only the same frozen consolidation after a lost reply", async () => {
  let lost = true;
  transport.mockImplementation(async (_path: string, o?: { method?: string }) => {
    if (!o?.method) return { email: "fictional-owner@example.test", profiles };
    if (lost) { lost = false; throw Error("Fictional reply lost"); }
    return result;
  });
  mount(); await acknowledge();
  fireEvent.click(screen.getByRole("button", { name: "Confirm consolidation" }));
  fireEvent.click(await screen.findByRole("button", { name: "Retry same consolidation" }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(writes()).toHaveLength(2);
  expect(writes()[0][1].idempotencyKey).toBe(writes()[1][1].idempotencyKey);
  expect(writes()[0][1].body).toEqual(writes()[1][1].body);
});
it("does not offer consolidation for one current profile or after a denied read", async () => {
  transport.mockResolvedValue({ email: "fictional-owner@example.test", profiles: [profiles[0]] });
  mount(); await screen.findByText(/only one current profile/);
  expect((screen.getByRole("button", { name: "Confirm consolidation" }) as HTMLButtonElement).disabled).toBe(true);
  transport.mockRejectedValue(new ApiFailure(403, "FORBIDDEN", "Review access changed"));
  fireEvent.click(screen.getByRole("button", { name: "Refresh matching profiles" }));
  await screen.findByText("Review access changed");
  expect(screen.queryByText("fictional-owner@example.test")).toBeNull();
  expect(writes()).toHaveLength(0);
});
it("pauses the action when the browser goes offline", async () => {
  mount(); await acknowledge();
  act(() => window.dispatchEvent(new Event("offline")));
  expect((screen.getByRole("button", { name: "Confirm consolidation" }) as HTMLButtonElement).disabled).toBe(true);
});
