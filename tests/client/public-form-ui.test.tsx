// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PublicForm from "../../src/ui/forms/PublicForm";
import { createTemplate, newField } from "../../shared/forms";
import { ApiFailure } from "../../src/lib/api";
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
function fixture({
  review = false,
  status = "Open",
  copyAvailable = true,
} = {}) {
  const template = createTemplate("Fictional respondent form", "blank"),
    field = {
      ...newField("short", template.sections[0].id),
      label: "Fictional answer",
      required: true,
    };
  return {
    ...template,
    id: "f1080000-0000-4000-8000-000000000001",
    slug: "fictional",
    status,
    versionId: "f1080000-0000-4000-8000-000000000002",
    version: 1,
    fields: [field],
    copyAvailable,
    settings: { ...template.settings, review },
  };
}
function mount(query = "") {
  window.history.replaceState({}, "", "/forms/fictional" + query);
  return render(
    <MemoryRouter
      initialEntries={["/forms/fictional" + query]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/forms/:slug" element={<PublicForm />} />
      </Routes>
    </MemoryRouter>,
  );
}
async function fill() {
  await screen.findByRole("heading", { name: "Fictional respondent form" });
  fireEvent.change(screen.getByLabelText("Your name *"), {
    target: { value: "Fictional Respondent" },
  });
  fireEvent.change(screen.getByLabelText(/Your email \*/), {
    target: { value: "own-copy@example.test" },
  });
  fireEvent.change(screen.getByLabelText(/Fictional answer/), {
    target: { value: "A fictional answer" },
  });
}
function submit() {
  fireEvent.submit(
    screen.getByRole("button", { name: "Submit response" }).closest("form")!,
  );
}
beforeEach(() => {
  apiMock.mockReset();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(0), 0),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("FORM-TEST-031: respondent identity, submission, privacy and recovery UI", () => {
  it("requires a declared name/email and focuses the invalid identity before any write", async () => {
    apiMock.mockResolvedValue({ form: fixture() });
    mount();
    await screen.findByRole("heading", { name: "Fictional respondent form" });
    submit();
    expect(screen.getByRole("alert").textContent).toContain("Enter your name");
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText("Your name *")),
    );
    expect(
      screen.getByLabelText("Your name *").getAttribute("aria-invalid"),
    ).toBe("true");
    expect(
      apiMock.mock.calls.every(([, options]) => options.method !== "POST"),
    ).toBe(true);
    expect(
      document.querySelector('meta[name="robots"]')?.getAttribute("content"),
    ).toContain("noindex");
  });
  it("focuses a missing required answer after a valid identity", async () => {
    apiMock.mockResolvedValue({ form: fixture() });
    mount();
    await fill();
    fireEvent.change(screen.getByLabelText(/Fictional answer/), {
      target: { value: "" },
    });
    submit();
    expect(screen.getByRole("alert").textContent).toContain("Fictional answer");
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByLabelText(/Fictional answer/),
      ),
    );
    expect(
      screen.getByLabelText(/Fictional answer/).getAttribute("aria-invalid"),
    ).toBe("true");
  });
  it("freezes edits and prevents duplicate submission until the real response resolves", async () => {
    const form = fixture();
    let complete: (data: {
      responseId: string;
      copyQueued: boolean;
    }) => void = () => {};
    apiMock.mockImplementation((path: string) =>
      path.endsWith("/submissions")
        ? new Promise((resolve) => {
            complete = resolve;
          })
        : Promise.resolve({ form }),
    );
    mount();
    await fill();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Email me a copy of my completed response",
      }),
    );
    submit();
    expect(
      (screen.getByLabelText("Your name *") as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.submit(
      screen.getByRole("button", { name: "Saving…" }).closest("form")!,
    );
    expect(
      apiMock.mock.calls.filter(([path]) => path.endsWith("/submissions")),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("heading", { name: "Response submitted." }),
    ).toBeNull();
    const call = apiMock.mock.calls.find(([path]) =>
      path.endsWith("/submissions"),
    )!;
    expect(call[1].body.respondent).toEqual({
      name: "Fictional Respondent",
      email: "own-copy@example.test",
    });
    expect(call[1].body.copyRequested).toBe(true);
    expect(call[1].idempotencyKey).toBeTruthy();
    complete({ responseId: "fictional-response", copyQueued: true });
    const success = await screen.findByRole("heading", {
      name: "Response submitted.",
    });
    await waitFor(() => expect(document.activeElement).toBe(success));
    expect(screen.getByText(/queued for own-copy@example.test/)).toBeTruthy();
  });
  it("retains the same idempotency key after an uncertain failure and preserves the answers", async () => {
    const form = fixture();
    let writes = 0;
    apiMock.mockImplementation(async (path: string) => {
      if (!path.endsWith("/submissions")) return { form };
      if (++writes === 1) throw Error("Fictional connection failure");
      return { responseId: "fictional-retry", copyQueued: false };
    });
    mount();
    await fill();
    submit();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Fictional connection failure",
    );
    expect(
      (screen.getByLabelText(/Fictional answer/) as HTMLInputElement).value,
    ).toBe("A fictional answer");
    submit();
    await screen.findByRole("heading", { name: "Response submitted." });
    const calls = apiMock.mock.calls.filter(([path]) =>
      path.endsWith("/submissions"),
    );
    expect(calls[1][1].idempotencyKey).toBe(calls[0][1].idempotencyKey);
  });
  it("shows review and allows returning to answers before final submission", async () => {
    apiMock.mockResolvedValue({ form: fixture({ review: true }) });
    mount();
    await fill();
    fireEvent.submit(
      screen.getByRole("button", { name: "Next" }).closest("form")!,
    );
    const review = await screen.findByRole("heading", {
      name: "One last look.",
    });
    expect(document.activeElement).toBe(review);
    expect(screen.getByText("A fictional answer")).toBeTruthy();
    expect(
      apiMock.mock.calls.every(([, options]) => options.method !== "POST"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      (screen.getByLabelText(/Fictional answer/) as HTMLInputElement).value,
    ).toBe("A fictional answer");
  });
  it("keeps preview non-submitting even when a submit event is dispatched directly", async () => {
    apiMock.mockResolvedValue({ form: fixture() });
    mount("?preview=1");
    await fill();
    expect(
      (
        screen.getByRole("button", {
          name: "Submit response",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    submit();
    expect(
      screen.getByText(/This is a preview. Return to the builder/),
    ).toBeTruthy();
    expect(
      apiMock.mock.calls.every(([, options]) => options.method !== "POST"),
    ).toBe(true);
    expect(
      screen.queryByRole("button", { name: "Save and resume later" }),
    ).toBeNull();
  });
  it("refuses final offline submission while retaining the typed response", async () => {
    apiMock.mockResolvedValue({ form: fixture() });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    mount();
    await fill();
    submit();
    expect(screen.getByRole("alert").textContent).toContain(
      "Reconnect to submit",
    );
    expect(
      (screen.getByLabelText(/Fictional answer/) as HTMLInputElement).value,
    ).toBe("A fictional answer");
    expect(
      apiMock.mock.calls.every(([, options]) => options.method !== "POST"),
    ).toBe(true);
  });
  it("uses a truthful closed state and keeps unavailable response copies disabled", async () => {
    apiMock.mockResolvedValue({ form: fixture({ status: "Closed" }) });
    const view = mount();
    await screen.findByText("Not accepting responses");
    expect(
      screen.queryByRole("button", { name: "Submit response" }),
    ).toBeNull();
    view.unmount();
    apiMock.mockResolvedValue({ form: fixture({ copyAvailable: false }) });
    mount();
    await fill();
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Email me a copy of my completed response",
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.getByText(/Email copies are currently unavailable/),
    ).toBeTruthy();
  });
  it("distinguishes private-access denial from a generic load failure without leaking a form", async () => {
    apiMock.mockRejectedValue(
      new ApiFailure(403, "ACCESS_REQUIRED", "Private access required"),
    );
    const view = mount();
    await screen.findByRole("heading", {
      name: "This form requires private access",
    });
    expect(
      screen.queryByRole("heading", { name: "Fictional respondent form" }),
    ).toBeNull();
    view.unmount();
    apiMock.mockRejectedValue(Error("Fictional unavailable form"));
    mount();
    await screen.findByRole("heading", { name: "This form isn’t available" });
    expect(screen.getByText("Fictional unavailable form")).toBeTruthy();
  });
  it("saves declared identity with a draft and copies only a fragment-based private resume link", async () => {
    const form = fixture(),
      resumeToken = "r".repeat(43),
      writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", {
      ...navigator,
      onLine: true,
      clipboard: { writeText },
    });
    apiMock.mockImplementation(async (path: string) =>
      path.endsWith("/drafts")
        ? { resumeToken, expiresAt: "2026-11-01T12:00:00Z", expiresInDays: 7 }
        : { form },
    );
    mount();
    await fill();
    fireEvent.click(
      screen.getByRole("button", { name: "Save and resume later" }),
    );
    await screen.findByRole("heading", { name: "Your private resume link" });
    const write = apiMock.mock.calls.find(([path]) =>
      path.endsWith("/drafts"),
    )!;
    expect(write[1].body.respondent.email).toBe("own-copy@example.test");
    fireEvent.click(screen.getByRole("button", { name: "Copy private link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const copied = new URL(writeText.mock.calls[0][0]);
    expect(copied.pathname).toBe("/forms/fictional");
    expect(copied.search).toBe("");
    expect(new URLSearchParams(copied.hash.slice(1)).get("resume")).toBe(
      resumeToken,
    );
    expect(
      new URLSearchParams(copied.hash.slice(1)).get("upload"),
    ).toHaveLength(43);
  });
  it("restores a private draft and strips its fragment without putting capabilities in API URLs", async () => {
    const form = fixture(),
      resumeToken = "r".repeat(43),
      answers = { [form.fields[0].id]: "Restored fictional answer" };
    apiMock.mockImplementation(async (path: string) =>
      path.endsWith("/drafts/load")
        ? {
            answers,
            respondent: {
              name: "Fictional Resumed",
              email: "resumed@example.test",
            },
            copyRequested: true,
          }
        : { form },
    );
    mount("#resume=" + resumeToken);
    await screen.findByText("Your saved draft was restored.");
    expect(
      (screen.getByLabelText("Your name *") as HTMLInputElement).value,
    ).toBe("Fictional Resumed");
    expect(
      (screen.getByLabelText(/Fictional answer/) as HTMLInputElement).value,
    ).toBe("Restored fictional answer");
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Email me a copy of my completed response",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(window.location.hash).toBe("");
    expect(
      apiMock.mock.calls.find(([path]) => path.endsWith("/drafts/load"))![1]
        .body.resumeToken,
    ).toBe(resumeToken);
    expect(
      apiMock.mock.calls.every(([path]) => !path.includes(resumeToken)),
    ).toBe(true);
  });
  it("uses the separate edit endpoint and exact response revision without a new upload identity", async () => {
    const form = fixture(),
      editToken = "e".repeat(43);
    apiMock.mockImplementation(async (path: string) =>
      path.endsWith("/edits/load")
        ? {
            form,
            responseId: "fictional-edited-response",
            revision: 3,
            answers: { [form.fields[0].id]: "Previous fictional answer" },
            respondent: {
              name: "Fictional Editor",
              email: "edited@example.test",
            },
          }
        : path.endsWith("/edits")
          ? { responseId: "fictional-edited-response", revision: 4 }
          : { form },
    );
    mount("#edit=" + editToken);
    await screen.findByText(
      "Your response is ready to edit. Previous answers stay private.",
    );
    fireEvent.change(screen.getByLabelText(/Fictional answer/), {
      target: { value: "Revised fictional answer" },
    });
    submit();
    await screen.findByRole("heading", { name: "Response submitted." });
    const edit = apiMock.mock.calls.find(([path]) => path.endsWith("/edits"))!;
    expect(edit[1].body).toMatchObject({ editToken, revision: 3 });
    expect(edit[1].body).not.toHaveProperty("uploadToken");
    expect(
      apiMock.mock.calls.some(([path]) => path.endsWith("/submissions")),
    ).toBe(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Review your answers" }),
    );
    expect(
      (screen.getByLabelText(/Fictional answer/) as HTMLInputElement).value,
    ).toBe("Revised fictional answer");
  });
  it("associates server validation errors with the correct question and restores its focus", async () => {
    const form = fixture(),
      fieldId = form.fields[0].id;
    apiMock.mockImplementation(async (path: string) => {
      if (path.endsWith("/submissions"))
        throw new ApiFailure(
          400,
          "VALIDATION_ERROR",
          "Fictional answer needs correction",
          { [fieldId]: "Check this field." },
        );
      return { form };
    });
    mount();
    await fill();
    submit();
    await screen.findByRole("alert");
    expect(
      screen.getByLabelText(/Fictional answer/).getAttribute("aria-invalid"),
    ).toBe("true");
    expect(
      screen
        .getByLabelText(/Fictional answer/)
        .getAttribute("aria-describedby"),
    ).toContain("-error");
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByLabelText(/Fictional answer/),
      ),
    );
  });
  it("requests a private verification link with a bounded entered identity and preserves generic delivery feedback", async () => {
    apiMock.mockImplementation(async (path: string) => {
      if (path.endsWith("/verify"))
        return { message: "If eligible, a private access link is on its way." };
      throw new ApiFailure(403, "ACCESS_REQUIRED", "Private access required");
    });
    mount();
    await screen.findByRole("heading", {
      name: "This form requires private access",
    });
    fireEvent.change(screen.getByLabelText(/Email address/), {
      target: { value: "fictional-invite@example.test" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Request verification link" })
        .closest("form")!,
    );
    await screen.findByText(
      "If eligible, a private access link is on its way.",
    );
    expect(apiMock).toHaveBeenCalledWith("/forms/fictional/verify", {
      method: "POST",
      body: { email: "fictional-invite@example.test", website: "" },
    });
  });
});
