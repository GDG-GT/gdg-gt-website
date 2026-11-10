// @vitest-environment jsdom
import React, { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import RecordPicker from "../../src/ui/RecordPicker";
import RecordAcknowledgement from "../../src/ui/RecordAcknowledgement";
import HistoricalResponsePicker from "../../src/ui/privacy/HistoricalResponsePicker";
import { ApiFailure } from "../../src/lib/api";
const { transport } = vi.hoisted(() => ({ transport: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()), api: transport,
}));
const id = "f1700000-0000-4000-8000-000000000001";
beforeEach(() => {
  transport.mockReset();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  transport.mockResolvedValue({ items: [{ id, title: "DevFest Atlanta" }], total: 1, pageSize: 30 });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function Picker() {
  const [value, setValue] = useState("");
  return <RecordPicker label="Event" name="event" endpoint="/admin/events" value={value} onChange={(choice) => setValue(choice?.id || "")} />;
}
it("chooses and clears a named record while keeping its ID out of visible copy", async () => {
  const page = render(<Picker />);
  expect(transport).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Choose event" }));
  fireEvent.click(await screen.findByRole("button", { name: "DevFest Atlanta" }));
  expect(page.container.textContent).not.toContain(id);
  expect(page.container.querySelector<HTMLInputElement>('input[name="event"]')?.value).toBe(id);
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Change event" }));
  fireEvent.click(screen.getByRole("button", { name: "Clear event" }));
  expect(page.container.querySelector<HTMLInputElement>('input[name="event"]')?.value).toBe("");
});
it("uses server pagination and hides old choices until the search finishes", async () => {
  render(<Picker />);
  transport.mockResolvedValue({ items: [{ id, title: "DevFest Atlanta" }], total: 31, pageSize: 30 });
  fireEvent.click(screen.getByRole("button", { name: "Choose event" }));
  await screen.findByRole("button", { name: "DevFest Atlanta" });
  fireEvent.click(screen.getByRole("button", { name: "More event choices" }));
  await waitFor(() => expect(transport.mock.calls.at(-1)?.[0]).toBe("/admin/events?q=&page=2"));
  transport.mockResolvedValue({ items: [{ id, title: "HackGT" }], total: 1 });
  fireEvent.change(screen.getByLabelText("Search event"), { target: { value: "Hack" } });
  expect(screen.queryByRole("button", { name: "DevFest Atlanta" })).toBeNull();
  await screen.findByRole("button", { name: "HackGT" });
  expect(transport.mock.calls.at(-1)?.[0]).toBe("/admin/events?q=Hack&page=1");
});
it("clears choices after access is denied and recovers by explicit retry", async () => {
  render(<Picker />);
  transport.mockRejectedValue(new ApiFailure(403, "FORBIDDEN", "Event access changed"));
  fireEvent.click(screen.getByRole("button", { name: "Choose event" }));
  await screen.findByText("Event access changed");
  expect(screen.queryByRole("button", { name: "DevFest Atlanta" })).toBeNull();
  transport.mockResolvedValue({ items: [{ id, title: "DevFest Atlanta" }], total: 1 });
  fireEvent.click(screen.getByRole("button", { name: "Retry event choices" }));
  await screen.findByRole("button", { name: "DevFest Atlanta" });
  act(() => window.dispatchEvent(new Event("offline")));
  // useOnlineStatus reacts to the event even if the platform property is delayed.
  expect(screen.queryByRole("button", { name: "DevFest Atlanta" })).toBeNull();
});
it("binds a named acknowledgement to the exact current record", () => {
  const changed = vi.fn();
  const view = render(<RecordAcknowledgement label="Archive Anish Kamath" reference={id} value="" onChange={changed} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Archive Anish Kamath" }));
  expect(changed).toHaveBeenCalledWith(id);
  view.rerender(<RecordAcknowledgement label="Archive another member" reference="other-reference" value={id} onChange={changed} />);
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  expect(view.container.textContent).not.toContain(id);
});
it("can find an archived account without typing its ID", async () => {
  const changed = vi.fn();
  render(<RecordPicker label="Account" endpoint="/admin/users" value="" onChange={changed}
    inventories={[{ label: "Current accounts", endpoint: "/admin/users" }, { label: "Archived accounts", endpoint: "/admin/users?state=archived" }]} />);
  fireEvent.click(screen.getByRole("button", { name: "Choose account" }));
  await screen.findByRole("button", { name: "DevFest Atlanta" });
  transport.mockResolvedValue({ items: [{ id, display_name: "Former officer", email: "former@example.test" }], total: 1 });
  fireEvent.change(screen.getByLabelText("Account inventory"), { target: { value: "/admin/users?state=archived" } });
  fireEvent.click(await screen.findByRole("button", { name: "Former officer · former@example.test" }));
  expect(changed).toHaveBeenCalledWith({ id, label: "Former officer" });
  expect(transport.mock.calls.at(-1)?.[0]).toBe("/admin/users?state=archived&q=&page=1");
});
it("rejects a malformed inventory without exposing selectable records", async () => {
  transport.mockResolvedValue({ items: [null], total: 1 });
  render(<Picker />);
  fireEvent.click(screen.getByRole("button", { name: "Choose event" }));
  await screen.findByText("The choices could not be verified.");
  expect(screen.queryByRole("button", { name: "DevFest Atlanta" })).toBeNull();
});
it("selects only eligible historical responses by form and submission time", async () => {
  function Historical() {
    const [value, setValue] = useState("");
    return <HistoricalResponsePicker value={value} onChange={setValue} />;
  }
  const view = render(<Historical />);
  fireEvent.click(screen.getByRole("button", { name: "Choose historical form" }));
  fireEvent.click(await screen.findByRole("button", { name: "DevFest Atlanta" }));
  transport.mockResolvedValue({ items: [
    { id, submittedAt: "2025-01-01T12:00:00Z", respondent: { source: "legacy_unknown" } },
    { id: "identified", submittedAt: "2025-01-02T12:00:00Z", respondent: { source: "self_reported" } },
  ], total: 2, pageSize: 30 });
  fireEvent.click(screen.getByRole("button", { name: "Choose historical response" }));
  const choice = await screen.findByRole("button", { name: /^Response ·/ });
  fireEvent.click(choice);
  expect(view.container.textContent).not.toContain(id);
  expect(screen.getByRole("list", { name: "Selected historical responses" }).textContent).toContain("DevFest Atlanta");
  fireEvent.click(screen.getByRole("button", { name: /^Remove DevFest Atlanta/ }));
  expect(screen.queryByRole("list", { name: "Selected historical responses" })).toBeNull();
});
