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
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import PublicForm from "../../src/ui/forms/PublicForm";
import { createTemplate, newField } from "../../shared/forms";
import { ApiFailure } from "../../src/lib/api";
import {
  prepareRespondentWrite,
  validRespondentReceipt,
} from "../../src/ui/forms/respondent-write";
const { transport, guard } = vi.hoisted(() => ({
  transport: vi.fn(),
  guard: vi.fn(),
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: transport,
}));
vi.mock("@/hooks/useDraftGuard", () => ({ useDraftGuard: guard }));
const formId = "f1310000-0000-4000-8000-000000000001",
  versionId = "f1310000-0000-4000-8000-000000000002",
  fieldId = "f1310000-0000-4000-8000-000000000003",
  responseId = "f1310000-0000-4000-8000-000000000004",
  editToken = "e".repeat(43);
const template = createTemplate("Fictional original respondent write", "blank"),
  field = {
    ...newField("short", template.sections[0].id),
    id: fieldId,
    label: "Fictional original answer",
    required: true,
  },
  form = {
    ...template,
    id: formId,
    slug: "fictional-write",
    versionId,
    version: 1,
    status: "Open",
    fields: [field],
    settings: {
      ...template.settings,
      review: false,
      resume: true,
      editing: true,
    },
    copyAvailable: true,
  },
  identity = {
    name: "Fictional Respondent",
    email: "own-response@example.test",
  };
let action: "submissions" | "edits" | "drafts",
  loss: "before" | "after" | "none",
  commits: number,
  receipts: Map<string, Record<string, unknown>>,
  inspectError: Error | undefined,
  stale: boolean,
  secondLoss: boolean;
type Options = {
  method?: string;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  signal?: AbortSignal;
};
const writes = () =>
  transport.mock.calls.filter(([path]) => path.endsWith("/" + action));
function mount(hash?: string) {
  const url =
    "/forms/fictional-write" +
    (hash ?? (action === "edits" ? "#edit=" + editToken : ""));
  window.history.replaceState({}, "", url);
  return render(
    <MemoryRouter initialEntries={[url]}>
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
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
async function fill() {
  await screen.findByRole("heading", { name: form.title });
  if (action !== "edits") {
    fireEvent.change(screen.getByLabelText("Your name *"), {
      target: { value: identity.name },
    });
    fireEvent.change(screen.getByLabelText(/Your email \*/), {
      target: { value: identity.email },
    });
  }
  fireEvent.change(screen.getByLabelText(/Fictional original answer/), {
    target: { value: "Frozen original answer" },
  });
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "Email me a copy of my completed response",
    }),
  );
}
function send() {
  if (action === "drafts") click("Save and resume later");
  else
    fireEvent.submit(
      screen.getByRole("button", { name: "Submit response" }).closest("form")!,
    );
}
const title = () =>
  action === "drafts"
    ? "draft save"
    : action === "edits"
      ? "response edit"
      : "submission";
async function start() {
  mount();
  await fill();
  send();
  await screen.findByRole("region", { name: "Unconfirmed form request" });
  await screen.findByRole("alert");
}
async function success() {
  if (action === "drafts")
    await screen.findByRole("heading", { name: "Your private resume link" });
  else await screen.findByRole("heading", { name: "Response submitted." });
}
beforeEach(() => {
  action = "submissions";
  loss = "none";
  commits = 0;
  receipts = new Map();
  inspectError = undefined;
  stale = false;
  secondLoss = false;
  transport.mockReset();
  guard.mockReset();
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  transport.mockImplementation(async (path: string, o: Options = {}) => {
    if (path.endsWith("/edits/load"))
      return {
        form,
        responseId,
        revision: 3,
        answers: { [fieldId]: "Previous answer" },
        respondent: identity,
      };
    if (path.endsWith("/recovery")) {
      if (inspectError) throw inspectError;
      const value = receipts.get(o.idempotencyKey!),
        receipt =
          value && action === "drafts"
            ? {
                revision: value.revision,
                expiresAt: value.expiresAt,
                createdAt: "2026-11-06T12:00:00Z",
              }
            : value || null;
      return {
        committed: !!value,
        canRetry: !value && !stale,
        ...(action !== "submissions"
          ? { currentRevision: stale ? 9 : action === "edits" ? 3 : 0 }
          : {}),
        receipt,
      };
    }
    if (path.endsWith("/" + action)) {
      if (loss === "before") {
        loss = "none";
        throw Error("Fictional unaccepted reply loss");
      }
      if (!receipts.has(o.idempotencyKey!)) {
        commits++;
        receipts.set(
          o.idempotencyKey!,
          action === "drafts"
            ? {
                resumeToken: o.body!.resumeToken,
                revision: 2,
                expiresAt: "2026-11-13T12:00:00Z",
              }
            : {
                responseId,
                copyQueued: true,
                ...(action === "edits" ? { revision: 4 } : { editToken }),
              },
        );
      }
      if (loss === "after" || secondLoss) {
        loss = "none";
        secondLoss = false;
        throw Error("Fictional accepted reply loss");
      }
      return receipts.get(o.idempotencyKey!);
    }
    return { form };
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Respondent frozen submit/edit/draft outcome recovery", () => {
  for (const operation of ["submissions", "edits", "drafts"] as const)
    for (const position of ["before", "after"] as const)
      it(`${operation} ${position} reply loss preserves original body/key/identity and uses read-only receipt inspection`, async () => {
        action = operation;
        loss = position;
        await start();
        const first = writes()[0][1];
        expect(
          (
            screen.getByRole("button", {
              name: "Retry original " + title(),
            }) as HTMLButtonElement
          ).disabled,
        ).toBe(true);
        expect(
          (
            screen.getByRole("button", {
              name: "Submit response",
            }) as HTMLButtonElement
          ).disabled,
        ).toBe(true);
        expect(guard.mock.calls.at(-1)?.[1]).toMatchObject({
          busy: true,
          privateDraft: true,
        });
        send();
        expect(writes()).toHaveLength(1);
        click("Check original " + title() + " outcome");
        if (position === "before") {
          await waitFor(() =>
            expect(
              (
                screen.getByRole("button", {
                  name: "Retry original " + title(),
                }) as HTMLButtonElement
              ).disabled,
            ).toBe(false),
          );
          click("Retry original " + title());
        }
        await success();
        expect(commits).toBe(1);
        expect(writes()).toHaveLength(position === "before" ? 2 : 1);
        for (const [, options] of writes()) {
          expect(options.body).toEqual(first.body);
          expect(options.idempotencyKey).toBe(first.idempotencyKey);
        }
        const inspection = transport.mock.calls.find(([path]) =>
          path.endsWith("/recovery"),
        )![1];
        expect(inspection.body).toEqual(first.body);
        expect(inspection.idempotencyKey).toBe(first.idempotencyKey);
        expect(first.body.respondent).toEqual(identity);
        expect(first.body.copyRequested).toBe(true);
        if (operation === "drafts") {
          expect(first.body.resumeToken).toHaveLength(43);
          expect(first.body.draftRevision).toBe(0);
          expect(first.body.uploadToken).toHaveLength(43);
        }
      });
  it.each(["submissions", "edits", "drafts"] as const)(
    "keeps %s frozen after transient outcome inspection failure",
    async (operation) => {
      action = operation;
      loss = "before";
      await start();
      inspectError = Error("Fictional outcome read outage");
      click("Check original " + title() + " outcome");
      await screen.findByText("Fictional outcome read outage");
      expect(writes()).toHaveLength(1);
      expect(
        (
          screen.getByRole("button", {
            name: "Retry original " + title(),
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      inspectError = undefined;
      click("Check original " + title() + " outcome");
      await waitFor(() =>
        expect(
          (
            screen.getByRole("button", {
              name: "Retry original " + title(),
            }) as HTMLButtonElement
          ).disabled,
        ).toBe(false),
      );
    },
  );
  it.each(["submissions", "edits", "drafts"] as const)(
    "refuses a current-state-conflicting original %s retry",
    async (operation) => {
      action = operation;
      loss = "before";
      await start();
      stale = true;
      click("Check original " + title() + " outcome");
      await screen.findByText(/current form or saved-response state prevents/);
      expect(
        (
          screen.getByRole("button", {
            name: "Retry original " + title(),
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(writes()).toHaveLength(1);
    },
  );
  it("requires another read after a second lost reply and confirms the now accepted receipt without another write", async () => {
    loss = "before";
    await start();
    click("Check original submission outcome");
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Retry original submission",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    secondLoss = true;
    click("Retry original submission");
    await screen.findByText("Fictional accepted reply loss");
    expect(
      (
        screen.getByRole("button", {
          name: "Retry original submission",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    click("Check original submission outcome");
    await success();
    expect(writes()).toHaveLength(2);
    expect(commits).toBe(1);
  });
  it("requires fresh inspection after reconnect and never automatically retries the original request", async () => {
    loss = "before";
    await start();
    click("Check original submission outcome");
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Retry original submission",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    expect(
      (
        screen.getByRole("button", {
          name: "Retry original submission",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(writes()).toHaveLength(1);
    expect(
      transport.mock.calls.filter(([p]) => p.endsWith("/recovery")),
    ).toHaveLength(1);
  });
  it.each([401, 403, 404])(
    "clears private parent state after original-outcome inspection denial %s",
    async (status) => {
      loss = "before";
      await start();
      inspectError = new ApiFailure(
        status,
        "DENIED",
        "Fictional original form access denied",
      );
      click("Check original submission outcome");
      await screen.findByRole("heading", { name: "This form isn’t available" });
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(screen.queryByRole("heading", { name: form.title })).toBeNull();
      expect(
        screen.queryByRole("region", { name: "Unconfirmed form request" }),
      ).toBeNull();
      expect(writes()).toHaveLength(1);
    },
  );
  it("fences an expired original intent before any additional request", async () => {
    loss = "before";
    await start();
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 47 * 60 * 60 * 1000 + 1);
    const before = transport.mock.calls.length;
    click("Check original submission outcome");
    await screen.findByText(/safe original-request recovery window ended/);
    expect(transport.mock.calls).toHaveLength(before);
  });
  it("requires reviewed stopping, clears all private fields and never sends a replacement response", async () => {
    loss = "after";
    await start();
    fireEvent.click(screen.getByText("Review stopping form recovery"));
    click("Stop tracking this form request");
    await screen.findByRole("heading", { name: "Form recovery stopped" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(writes()).toHaveLength(1);
    expect(commits).toBe(1);
  });
  it("aborts a pending response on offline and ignores its delayed acknowledgment until explicit reconciliation", async () => {
    let finish!: (value: unknown) => void;
    const original = transport.getMockImplementation()!;
    transport.mockImplementation(async (path: string, o: Options = {}) =>
      path.endsWith("/submissions")
        ? new Promise((resolve) => {
            receipts.set(o.idempotencyKey!, {
              responseId,
              copyQueued: true,
              editToken,
            });
            commits++;
            finish = resolve;
          })
        : original(path, o),
    );
    mount();
    await fill();
    send();
    await waitFor(() => expect(writes()).toHaveLength(1));
    const request = writes()[0][1];
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    expect(request.signal.aborted).toBe(true);
    await act(async () => finish({ responseId, copyQueued: true, editToken }));
    expect(
      screen.queryByRole("heading", { name: "Response submitted." }),
    ).toBeNull();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    click("Check original submission outcome");
    await success();
    expect(writes()).toHaveLength(1);
  });
  it("preserves a stale draft proposal until reviewed reload, then saves against its current server revision", async () => {
    action = "drafts";
    const resume = "r".repeat(43);
    let loaded = 0,
      saved = 0;
    const original = transport.getMockImplementation()!;
    transport.mockImplementation(async (path: string, o: Options = {}) => {
      if (path.endsWith("/drafts/load"))
        return {
          answers: {
            [fieldId]:
              ++loaded === 1 ? "Earlier saved answer" : "Newer saved answer",
          },
          respondent: identity,
          copyRequested: false,
          revision: loaded === 1 ? 3 : 7,
        };
      if (path.endsWith("/drafts")) {
        if (++saved === 1)
          throw new ApiFailure(409, "CONFLICT", "A newer saved draft exists.");
        return {
          resumeToken: o.body!.resumeToken,
          revision: 9,
          expiresAt: "2026-11-13T12:00:00Z",
        };
      }
      return original(path, o);
    });
    mount("#resume=" + resume + "&upload=" + "u".repeat(43));
    await screen.findByText("Your saved draft was restored.");
    fireEvent.change(screen.getByLabelText(/Fictional original answer/), {
      target: { value: "Unsaved local proposal" },
    });
    send();
    await screen.findByText("A newer saved draft exists.");
    expect(
      (screen.getByLabelText(/Fictional original answer/) as HTMLInputElement)
        .value,
    ).toBe("Unsaved local proposal");
    expect(loaded).toBe(1);
    send();
    expect(writes()).toHaveLength(1);
    fireEvent.click(screen.getByText("Review loading current saved answers"));
    click("Load current draft and discard typed changes");
    await waitFor(() =>
      expect(
        (screen.getByLabelText(/Fictional original answer/) as HTMLInputElement)
          .value,
      ).toBe("Newer saved answer"),
    );
    send();
    await success();
    expect(writes().map(([, o]) => o.body.draftRevision)).toEqual([3, 7]);
    expect(writes()[0][1].body.resumeToken).toBe(resume);
    expect(writes()[1][1].body.resumeToken).toBe(resume);
  });
  it("rejects another edit response ID, changed draft capability, and unconfirmed copy acknowledgment", () => {
    const edit = prepareRespondentWrite(
        "fictional",
        "edits",
        { revision: 3 },
        false,
        responseId,
      ),
      draft = prepareRespondentWrite(
        "fictional",
        "drafts",
        { draftRevision: 0, resumeToken: "r".repeat(43) },
        false,
      ),
      submit = prepareRespondentWrite("fictional", "submissions", {}, false);
    expect(
      validRespondentReceipt(edit, {
        responseId: "foreign-response",
        revision: 4,
        copyQueued: false,
      }),
    ).toBe(false);
    expect(
      validRespondentReceipt(draft, {
        resumeToken: "different",
        revision: 2,
        expiresAt: "2026-11-13T12:00:00Z",
      }),
    ).toBe(false);
    expect(validRespondentReceipt(submit, { responseId })).toBe(false);
  });
});
