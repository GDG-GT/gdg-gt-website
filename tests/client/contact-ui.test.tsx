// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { ContactPage } from "../../src/ui/PublicPages";
import { ContentProvider } from "../../src/contexts/ContentContext";
import NavigationSafety from "../../src/ui/NavigationSafety";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, prepare, abandon } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  prepare: vi.fn(),
  abandon: vi.fn(),
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/lib/contact-upload", async (original) => ({
  ...(await original<typeof import("../../src/lib/contact-upload")>()),
  prepareContactAttachment: prepare,
  abandonContactAttachment: abandon,
}));
const home = {
  settings: [],
  pages: [],
  navigation: [],
  footer: [],
  social: [],
  metrics: [],
  sponsors: [],
};
const routers: ReturnType<typeof createMemoryRouter>[] = [];
function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function mount(url = "/contact", guard = true) {
  const main = (
    <main id="main-content" tabIndex={-1}>
      <ContactPage />
    </main>
  );
  const router = createMemoryRouter(
    [
      {
        path: "/contact",
        element: (
          <ContentProvider>
            {guard ? <NavigationSafety>{main}</NavigationSafety> : main}
          </ContentProvider>
        ),
      },
    ],
    { initialEntries: [url], future: { v7_relativeSplatPath: true } },
  );
  routers.push(router);
  render(
    <RouterProvider router={router} future={{ v7_startTransition: true }} />,
  );
  return router;
}
const posts = () => apiMock.mock.calls.filter(([path]) => path === "/contact");
async function fill() {
  await screen.findByRole("heading", { name: "Say hello.", exact: true });
  fireEvent.change(screen.getByLabelText(/Full name/), {
    target: { value: "Fictional Contact" },
  });
  fireEvent.change(screen.getByLabelText(/Email address/), {
    target: { value: "fictional-contact@example.test" },
  });
  fireEvent.change(screen.getByLabelText(/Your message/), {
    target: {
      value: "A fictional message for local interaction verification.",
    },
  });
}
function submit() {
  const form = screen.getByLabelText(/Full name/).closest("form")!;
  fireEvent.submit(form);
  return form;
}
beforeEach(() => {
  apiMock.mockReset();
  prepare.mockReset();
  abandon.mockReset();
  abandon.mockResolvedValue(undefined);
  apiMock.mockImplementation((path: string) =>
    Promise.resolve(
      path === "/public/home" ? home : { accepted: true, message: "Saved" },
    ),
  );
});
afterEach(() => {
  cleanup();
  for (const r of routers.splice(0)) r.dispose();
});
describe("Contact submission and recovery", () => {
  it.each([
    ["sponsorship", "sponsorship"],
    ["not-an-inquiry", "general"],
  ])("preselects only a supported inquiry from %s", async (input, expected) => {
    mount("/contact?type=" + input);
    await screen.findByRole("heading", { name: "Say hello.", exact: true });
    expect(
      (screen.getByLabelText(/What brings you here/) as HTMLSelectElement)
        .value,
    ).toBe(expected);
  });
  it("captures the complete body before freezing every control and commits only once", async () => {
    const request = pending<{ accepted: boolean; message: string }>();
    apiMock.mockImplementation((path: string) =>
      path === "/public/home" ? Promise.resolve(home) : request.promise,
    );
    mount();
    await fill();
    fireEvent.change(screen.getByLabelText(/Interests/), {
      target: { value: "Cloud, Design" },
    });
    const form = submit();
    fireEvent.submit(form);
    expect(posts()).toHaveLength(1);
    expect(posts()[0][1].body).toMatchObject({
      name: "Fictional Contact",
      email: "fictional-contact@example.test",
      interests: ["Cloud", "Design"],
      type: "general",
    });
    for (const control of form.querySelectorAll<HTMLInputElement>(
      "input,select,textarea,button",
    ))
      expect(control.disabled).toBe(true);
    expect(screen.queryByText("Message received.")).toBeNull();
    await act(async () =>
      request.resolve({ accepted: true, message: "Saved" }),
    );
    const heading = await screen.findByRole("heading", {
      name: "Message received.",
    });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    fireEvent.click(
      screen.getByRole("button", { name: "Write another message" }),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: "Say hello.", exact: true }),
      ),
    );
    expect((screen.getByLabelText(/Full name/) as HTMLInputElement).value).toBe(
      "",
    );
    expect(
      (screen.getByLabelText(/Your message/) as HTMLTextAreaElement).value,
    ).toBe("");
  });
  it("preserves safe server errors, focuses the first field and clears only its corrected error", async () => {
    apiMock.mockImplementation((path: string) =>
      path === "/public/home"
        ? Promise.resolve(home)
        : Promise.reject(
            new ApiFailure(
              400,
              "VALIDATION_ERROR",
              "Check the highlighted fields.",
              {
                email: "Check this email.",
                message: "Check this message.",
                "private.secret": "Never display this",
              },
            ),
          ),
    );
    mount();
    await fill();
    submit();
    await screen.findByRole("alert");
    const email = screen.getByLabelText(/Email address/) as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(email));
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(
      document.getElementById(email.getAttribute("aria-describedby")!)
        ?.textContent,
    ).toBe("Check this email.");
    expect(screen.queryByText("Never display this")).toBeNull();
    fireEvent.change(email, { target: { value: "corrected@example.test" } });
    expect(email.getAttribute("aria-invalid")).toBe("false");
    expect(
      screen.getByLabelText(/Your message/).getAttribute("aria-invalid"),
    ).toBe("true");
    expect(document.activeElement).toBe(email);
  });
  it("focuses generic failure and retries the same message with the same idempotency key", async () => {
    let attempts = 0;
    apiMock.mockImplementation((path: string) =>
      path === "/public/home"
        ? Promise.resolve(home)
        : ++attempts === 1
          ? Promise.reject(Error("Fictional outage"))
          : Promise.resolve({ accepted: true, message: "Saved" }),
    );
    mount();
    await fill();
    submit();
    const error = await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(error));
    submit();
    await screen.findByRole("heading", { name: "Message received." });
    expect(posts()).toHaveLength(2);
    expect(posts()[0][1].idempotencyKey).toBe(posts()[1][1].idempotencyKey);
  });
  it("validates interest count before sending and focuses the associated control", async () => {
    mount();
    await fill();
    const interests = screen.getByLabelText(/Interests/);
    fireEvent.change(interests, {
      target: {
        value: Array.from({ length: 21 }, (_, i) => "interest" + i).join(","),
      },
    });
    submit();
    await waitFor(() => expect(document.activeElement).toBe(interests));
    expect(interests.getAttribute("aria-invalid")).toBe("true");
    expect(posts()).toHaveLength(0);
  });
  it.each([
    new File([], "empty.pdf", { type: "application/pdf" }),
    new File(["fixture"], "script.svg", { type: "image/svg+xml" }),
    new File([new Uint8Array(10485761)], "large.pdf", {
      type: "application/pdf",
    }),
  ])(
    "rejects invalid attachment $name before upload and restores file-control focus",
    async (file) => {
      mount();
      await fill();
      const input = screen.getByLabelText(/Attachment/) as HTMLInputElement;
      fireEvent.change(input, { target: { files: [file] } });
      submit();
      await waitFor(() => expect(document.activeElement).toBe(input));
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(prepare).not.toHaveBeenCalled();
      expect(posts()).toHaveLength(0);
      fireEvent.click(
        screen.getByRole("button", { name: "Remove attachment" }),
      );
      expect(document.activeElement).toBe(input);
      expect(input.getAttribute("aria-invalid")).toBe("false");
    },
  );
  it("waits for a clean attachment and retains its proof when retrying an ambiguous contact POST", async () => {
    const upload = pending<{ uploadId: string; uploadToken: string }>();
    prepare.mockImplementation((_state, _signal, progress) => {
      progress("Checking the attachment…");
      return upload.promise;
    });
    let attempts = 0;
    apiMock.mockImplementation((path: string) =>
      path === "/public/home"
        ? Promise.resolve(home)
        : ++attempts === 1
          ? Promise.reject(Error("Fictional outage"))
          : Promise.resolve({ accepted: true, message: "Saved" }),
    );
    mount();
    await fill();
    fireEvent.change(screen.getByLabelText(/Attachment/), {
      target: {
        files: [
          new File(["fictional"], "fixture.pdf", { type: "application/pdf" }),
        ],
      },
    });
    submit();
    await screen.findByRole("status");
    expect(posts()).toHaveLength(0);
    await act(async () =>
      upload.resolve({
        uploadId: "fictional-upload",
        uploadToken: "fictional-proof",
      }),
    );
    await screen.findByRole("alert");
    submit();
    await screen.findByRole("heading", { name: "Message received." });
    expect(prepare.mock.calls[0][0]).toBe(prepare.mock.calls[1][0]);
    expect(posts()[0][1].body.attachment).toEqual({
      uploadId: "fictional-upload",
      uploadToken: "fictional-proof",
    });
    expect(posts()[0][1].idempotencyKey).toBe(posts()[1][1].idempotencyKey);
  });
  it("keeps a draft on Stay and resets it only after an approved inquiry-route change", async () => {
    const router = mount("/contact?type=membership");
    await fill();
    await act(async () => {
      void router.navigate("/contact?type=sponsorship");
    });
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: /Stay/ }));
    expect((screen.getByLabelText(/Full name/) as HTMLInputElement).value).toBe(
      "Fictional Contact",
    );
    await act(async () => {
      void router.navigate("/contact?type=sponsorship");
    });
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: /Discard/ }));
    await waitFor(() =>
      expect(
        (screen.getByLabelText(/What brings you here/) as HTMLSelectElement)
          .value,
      ).toBe("sponsorship"),
    );
    expect((screen.getByLabelText(/Full name/) as HTMLInputElement).value).toBe(
      "",
    );
    expect(
      (screen.getByLabelText(/Your message/) as HTMLTextAreaElement).value,
    ).toBe("");
  });
  it("aborts an old request and never carries its confirmation into a new inquiry", async () => {
    const old = pending<{ accepted: boolean; message: string }>();
    apiMock.mockImplementation((path: string) =>
      path === "/public/home" ? Promise.resolve(home) : old.promise,
    );
    const router = mount("/contact?type=membership", false);
    await fill();
    submit();
    const signal = posts()[0][1].signal;
    await act(async () => {
      await router.navigate("/contact?type=sponsorship");
    });
    expect(signal.aborted).toBe(true);
    await act(async () => old.resolve({ accepted: true, message: "Saved" }));
    expect(
      screen.queryByRole("heading", { name: "Message received." }),
    ).toBeNull();
    expect(
      (screen.getByLabelText(/What brings you here/) as HTMLSelectElement)
        .value,
    ).toBe("sponsorship");
    expect(
      (
        screen.getByRole("button", {
          name: "Send message",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
});
