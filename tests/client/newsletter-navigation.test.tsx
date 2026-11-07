// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import NewsletterEditor from "../../src/ui/newsletter/NewsletterEditor";
import NavigationSafety from "../../src/ui/NavigationSafety";
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: apiMock,
  ApiFailure: class extends Error {},
}));
vi.mock("../../src/ui/forms/FormIntegrations", () => ({ default: () => null }));
const record = {
  id: "f1610000-0000-4000-8000-000000000001",
  teamId: null,
  revision: 1,
  actions: ["read", "update", "send_email"],
  deletedAt: null,
  subject: "Fictional unsent campaign",
  content: "Fictional private message",
  status: "draft",
  createdAt: "2026-10-27T12:00:00Z",
  updatedAt: "2026-10-27T12:00:00Z",
};
function mount() {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <NavigationSafety>
            <main>
              <NewsletterEditor
                kind="campaigns"
                record={record}
                scope="chapter"
                onSaved={vi.fn()}
                onClose={vi.fn()}
              />
            </main>
          </NavigationSafety>
        ),
      },
    ],
    {},
  );
  return render(<RouterProvider router={router} />);
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  apiMock.mockReset();
});
it("allows discarding an idle audience review without treating the editor lock as a running request", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  mount();
  fireEvent.click(
    screen.getByRole("button", { name: "Review audience & send" }),
  );
  expect(screen.getByLabelText(/Subject/).closest("fieldset")?.disabled).toBe(
    true,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Close delivery controls" }),
  );
  await screen.findByRole("alertdialog", { name: "Leave unsaved work?" });
  expect(
    screen.queryByRole("heading", { name: "An operation is still running" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Discard and leave" }));
  expect(
    screen.queryByRole("button", { name: "Generate send review" }),
  ).toBeNull();
  expect(screen.getByLabelText(/Subject/).closest("fieldset")?.disabled).toBe(
    false,
  );
  expect(apiMock).not.toHaveBeenCalled();
});
it("keeps real pending send-review work protected until its response finishes", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  let resolve!: (v: unknown) => void;
  const pending = new Promise((r) => {
    resolve = r;
  });
  apiMock.mockReturnValue(pending);
  mount();
  fireEvent.click(
    screen.getByRole("button", { name: "Review audience & send" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Generate send review" }));
  expect(
    (
      screen.getByRole("button", {
        name: "Close delivery controls",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  await act(async () =>
    resolve({
      reviewId: record.id,
      reviewToken: "fictional",
      count: 0,
      subject: record.subject,
      content: record.content,
      html: "",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      recipients: [],
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Close delivery controls" }),
  );
  await screen.findByRole("alertdialog", { name: "Leave unsaved work?" });
  fireEvent.click(screen.getByRole("button", { name: "Discard and leave" }));
  expect(screen.queryByRole("button", { name: "Approve send" })).toBeNull();
  expect(apiMock).toHaveBeenCalledTimes(1);
});
