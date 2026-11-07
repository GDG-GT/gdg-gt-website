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
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PublicForm from "../../src/ui/forms/PublicForm";
import { createTemplate, newField } from "../../shared/forms";
import { ApiFailure } from "../../src/lib/api";
import { reviewAnswer } from "../../src/ui/forms/review-answer";
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
    <MemoryRouter initialEntries={["/forms/fictional" + query]}>
      <Routes>
        <Route
          path="/forms/:slug"
          element={
            <main id="main-content" tabIndex={-1}>
              <PublicForm />
            </main>
          }
        />
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
      if (path.endsWith("/submissions/recovery"))
        return { committed: false, canRetry: true, receipt: null };
      if (!path.endsWith("/submissions")) return { form };
      if (++writes === 1) throw Error("Fictional connection failure");
      return { responseId: "fictional-retry", copyQueued: false };
    });
    mount();
    await fill();
    submit();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Check its original outcome",
    );
    expect(
      (screen.getByLabelText(/Fictional answer/) as HTMLInputElement).value,
    ).toBe("A fictional answer");
    submit();
    expect(
      apiMock.mock.calls.filter(([path]) => path.endsWith("/submissions")),
    ).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Check original submission outcome" }),
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Retry original submission",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original submission" }),
    );
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
      writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", {
      ...navigator,
      onLine: true,
      clipboard: { writeText },
    });
    apiMock.mockImplementation(async (path: string, options) =>
      path.endsWith("/drafts")
        ? {
            resumeToken: options.body.resumeToken,
            revision: 2,
            expiresAt: "2026-11-15T12:00:00Z",
            expiresInDays: 7,
          }
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
      write[1].body.resumeToken,
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
          ? {
              responseId: "fictional-edited-response",
              revision: 4,
              copyQueued: false,
            }
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
    expect(apiMock).toHaveBeenCalledWith(
      "/forms/fictional/verify",
      expect.objectContaining({
        method: "POST",
        body: { email: "fictional-invite@example.test", website: "" },
        signal: expect.any(AbortSignal),
      }),
    );
  });
});

describe("Form recovery and semantic focus", () => {
  it("keeps an offline draft only in the open tab and never auto-submits on reconnect", async () => {
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith("/submissions")
          ? { responseId: "fictional-online-response", copyQueued: false }
          : { form: fixture() },
      ),
    );
    mount();
    await fill();
    vi.stubGlobal("navigator", { ...navigator, onLine: false });
    fireEvent(window, new Event("offline"));
    expect(
      screen.getByText(
        /You’re offline. Your current answers remain in this open tab/,
      ),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Submit response",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Save and resume later",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    submit();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Reconnect to submit");
    expect(
      apiMock.mock.calls.filter(([path]) => path.endsWith("/submissions")),
    ).toHaveLength(0);
    vi.stubGlobal("navigator", { ...navigator, onLine: true });
    fireEvent(window, new Event("online"));
    expect(
      screen.queryByText(
        /You’re offline. Your current answers remain in this open tab/,
      ),
    ).toBeNull();
    expect(
      (screen.getByLabelText(/Fictional answer/) as HTMLInputElement).value,
    ).toBe("A fictional answer");
    expect(
      apiMock.mock.calls.filter(([path]) => path.endsWith("/submissions")),
    ).toHaveLength(0);
    submit();
    await screen.findByRole("heading", { name: "Response submitted." });
  });
  it("reviews private files by known filename or generic label, never their capability or object identity", () => {
    const privateId = "f1330000-0000-4000-8000-000000000001";
    expect(
      reviewAnswer([privateId], "file", { [privateId]: "fictional.pdf" }),
    ).toBe("fictional.pdf");
    expect(reviewAnswer([privateId], "file", {})).toBe("Private attachment");
  });
  it("focuses identity and required answers while animation frames are paused", async () => {
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 0),
    );
    apiMock.mockResolvedValue({ form: fixture() });
    mount();
    await screen.findByRole("heading", { name: "Fictional respondent form" });
    submit();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText("Your name *")),
    );
    await fill();
    fireEvent.change(screen.getByLabelText(/Fictional answer/), {
      target: { value: "" },
    });
    submit();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByLabelText(/Fictional answer/),
      ),
    );
  });
  it("focuses every section transition, including Back to section one", async () => {
    const form = fixture();
    form.sections[0].title = "First fictional section";
    form.sections.push({
      id: "second-fictional-section",
      title: "Second fictional section",
      description: "",
    });
    apiMock.mockResolvedValue({ form });
    mount();
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const second = await screen.findByRole("heading", {
      name: "Second fictional section",
    });
    expect(document.activeElement).toBe(second);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "First fictional section" }),
    );
  });
  it("returns server-rejected answers to their earlier section and focuses the enabled invalid control", async () => {
    const form = fixture();
    form.sections.push({
      id: "second-fictional-section",
      title: "Second fictional section",
      description: "",
    });
    apiMock.mockImplementation((path: string) =>
      path.endsWith("/submissions")
        ? Promise.reject(
            new ApiFailure(
              400,
              "VALIDATION_ERROR",
              "Check the supplied answer.",
              { [form.fields[0].id]: "Correct this answer." },
            ),
          )
        : Promise.resolve({ form }),
    );
    mount();
    await fill();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    submit();
    await screen.findByRole("alert");
    const input = screen.getByLabelText(/Fictional answer/) as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(input.disabled).toBe(false);
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });
  it("focuses generic submission errors instead of leaving focus on an unavailable control", async () => {
    apiMock.mockImplementation((path: string) =>
      path.endsWith("/submissions")
        ? Promise.reject(Error("Fictional server outage"))
        : Promise.resolve({ form: fixture() }),
    );
    mount();
    await fill();
    submit();
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(
      (
        screen.getByRole("button", {
          name: "Submit response",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("shows a real loading status and recovers a read failure with retained landmark focus", async () => {
    let calls = 0;
    apiMock.mockImplementation(() =>
      ++calls === 1
        ? Promise.reject(Error("Fictional read failure"))
        : Promise.resolve({ form: fixture() }),
    );
    mount();
    expect(screen.getByRole("status", { name: "Loading form" })).toBeTruthy();
    await screen.findByRole("heading", { name: "This form isn’t available" });
    fireEvent.click(screen.getByRole("button", { name: "Retry form" }));
    await screen.findByRole("heading", { name: "Fictional respondent form" });
    expect(document.activeElement?.id).toBe("main-content");
    expect(calls).toBe(2);
  });
  it("uses the branded 404 for a concealed draft and keeps its metadata private", async () => {
    apiMock.mockRejectedValue(new ApiFailure(404, "NOT_FOUND", "Not found"));
    mount();
    await screen.findByRole("heading", {
      name: "A little off the beaten path.",
    });
    expect(screen.getByText("404")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry form" })).toBeNull();
    expect(document.title).toMatch(/^Page not found/);
    expect(
      document.querySelector('meta[name="robots"]')?.getAttribute("content"),
    ).toBe("noindex, nofollow, noarchive");
  });
  it("keeps zero answers, labels cleared choices and formats grid review as readable text", async () => {
    const form = fixture({ review: true }),
      section = form.sections[0].id;
    const zero = { ...newField("number", section), label: "Fictional zero" },
      choices = {
        ...newField("checkbox", section),
        label: "Fictional choices",
      },
      matrix = { ...newField("likert", section), label: "Fictional matrix" };
    form.fields.push(zero, choices, matrix);
    apiMock.mockResolvedValue({ form });
    mount();
    await fill();
    fireEvent.change(screen.getByLabelText(/Fictional zero/), {
      target: { value: "0" },
    });
    const option = screen
      .getByRole("group", { name: /Fictional choices/ })
      .querySelector("input")!;
    fireEvent.click(option);
    fireEvent.click(option);
    const row = matrix.options[0],
      column = (matrix.columns || ["Disagree", "Neutral", "Agree"])[0];
    fireEvent.click(screen.getByLabelText(row + ": " + column));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("heading", { name: "One last look." });
    const answer = (label: string) =>
      screen
        .getByText(label, { exact: true })
        .closest("div")
        ?.querySelector("p")?.textContent;
    expect(answer("Fictional zero")).toBe("0");
    expect(answer("Fictional choices")).toBe("Not answered");
    expect(answer("Fictional matrix")).toBe(row + ": " + column);
  });
  it("makes private-link copy failure visible after a committed submission", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      onLine: true,
      clipboard: {
        writeText: vi
          .fn()
          .mockRejectedValue(Error("Fictional clipboard denial")),
      },
    });
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith("/submissions")
          ? {
              responseId: "fictional-response",
              editToken: "e".repeat(43),
              revision: 1,
              copyQueued: false,
            }
          : { form: fixture() },
      ),
    );
    mount();
    await fill();
    submit();
    await screen.findByRole("heading", { name: "Response submitted." });
    fireEvent.click(screen.getByRole("button", { name: "Copy private link" }));
    const status = await screen.findByText(
      "The private link could not be copied. Try again.",
    );
    await waitFor(() => expect(document.activeElement).toBe(status));
    expect(status.getAttribute("role")).toBe("status");
  });
  it("clears respondent identity, answers and pending callbacks when the account session is cleared", async () => {
    const form = fixture();
    let finish!: (value: { responseId: string }) => void;
    apiMock.mockImplementation((path: string) =>
      path.endsWith("/submissions")
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve({ form }),
    );
    mount();
    await fill();
    submit();
    const request = apiMock.mock.calls.find(([path]) =>
      path.endsWith("/submissions"),
    )![1];
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    await screen.findByRole("heading", { name: form.title });
    expect(request.signal.aborted).toBe(true);
    expect(
      (screen.getByLabelText("Your name *") as HTMLInputElement).value,
    ).toBe("");
    expect(
      (screen.getByLabelText(/Fictional answer/) as HTMLInputElement).value,
    ).toBe("");
    await act(async () => finish({ responseId: "obsolete-session-response" }));
    expect(
      screen.queryByRole("heading", { name: "Response submitted." }),
    ).toBeNull();
  });
  it("clears the parent form and private resumed answers when attachment authorization is denied", async () => {
    const form = fixture(),
      file = newField("file", form.sections[0].id);
    file.id = "f1300000-0000-4000-8000-000000000071";
    form.fields = [file];
    apiMock.mockImplementation(async (path: string) => {
      if (path.endsWith("/drafts/load"))
        return {
          answers: { [file.id]: ["f1300000-0000-4000-8000-000000000072"] },
          respondent: {
            name: "Private resumed person",
            email: "private-person@example.test",
          },
          copyRequested: false,
        };
      if (path.endsWith("/status"))
        throw new ApiFailure(
          403,
          "ACCESS_REQUIRED",
          "Fictional attachment access revoked",
        );
      return {
        form: {
          ...form,
          respondentContext: {
            source: "account",
            email: "private-person@example.test",
          },
        },
      };
    });
    window.history.replaceState(
      {},
      "",
      "/forms/fictional#resume=" + "r".repeat(43),
    );
    mount("#resume=" + "r".repeat(43));
    await screen.findByText(/Reopen the form using current chapter access/);
    expect(screen.queryByRole("heading", { name: form.title })).toBeNull();
    expect(screen.queryByText("Private resumed person")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      apiMock.mock.calls.some(([path]) => path.endsWith("/submissions")),
    ).toBe(false);
  });
  it("aborts an unfinished submission when the form unmounts and ignores its late result", async () => {
    let resolve!: (value: { responseId: string }) => void;
    apiMock.mockImplementation((path: string) =>
      path.endsWith("/submissions")
        ? new Promise((yes) => {
            resolve = yes;
          })
        : Promise.resolve({ form: fixture() }),
    );
    const view = mount();
    await fill();
    submit();
    const call = apiMock.mock.calls.find(([path]) =>
      path.endsWith("/submissions"),
    )!;
    view.unmount();
    expect(call[1].signal.aborted).toBe(true);
    mount();
    await screen.findByRole("heading", { name: "Fictional respondent form" });
    await act(async () => resolve({ responseId: "fictional-late" }));
    expect(
      screen.queryByRole("heading", { name: "Response submitted." }),
    ).toBeNull();
    expect(
      (screen.getByLabelText("Your name *") as HTMLInputElement).value,
    ).toBe("");
  });
});
