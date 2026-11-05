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
import { MemoryRouter } from "react-router-dom";
import CollectionWorkspace from "../../src/ui/content/CollectionWorkspace";
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/hooks/useDraftGuard", () => ({ useDraftGuard: vi.fn() }));
vi.mock("@/contexts/ContentContext", () => ({ useContent: () => ({}) }));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({
    currentAdmin: { id: "fictional-collection-admin", role: "admin" },
  }),
}));
const writes = () => apiMock.mock.calls.filter(([, o]) => o?.method);
beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((p: string, o?: { method?: string }) =>
    o?.method
      ? Promise.reject(Error("Resource save not confirmed"))
      : Promise.resolve(
          p.endsWith("/capabilities")
            ? { globalCreate: true, teams: [] }
            : { items: [], total: 0, page: 1, pageSize: 30 },
        ),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function draft() {
  render(
    <MemoryRouter>
      <CollectionWorkspace initialKind="resources" />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Create draft",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Create draft" }));
  fireEvent.change(screen.getByLabelText(/^Title/), {
    target: { value: "Fictional retry resource" },
  });
  fireEvent.change(screen.getByLabelText(/^Description/), {
    target: { value: "Fictional resource description" },
  });
  return screen.getByLabelText(/^Title/).closest("form")!;
}
it("reuses an unchanged resource create intent after an uncertain response", async () => {
  const form = await draft();
  fireEvent.submit(form);
  await screen.findByText("Resource save not confirmed");
  fireEvent.submit(form);
  await waitFor(() => expect(writes()).toHaveLength(2));
  expect(writes()[0][1].idempotencyKey).toMatch(/^[a-f0-9-]{36}$/);
  expect(writes()[1][1].idempotencyKey).toBe(writes()[0][1].idempotencyKey);
});
it("creates a different retry intent when corrected resource content changes", async () => {
  const form = await draft();
  fireEvent.submit(form);
  await screen.findByText("Resource save not confirmed");
  fireEvent.change(screen.getByLabelText(/^Title/), {
    target: { value: "Fictional corrected resource" },
  });
  fireEvent.submit(form);
  await waitFor(() => expect(writes()).toHaveLength(2));
  expect(writes()[1][1].idempotencyKey).not.toBe(writes()[0][1].idempotencyKey);
});
