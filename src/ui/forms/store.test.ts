import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../preview-data", () => ({ localPreviewEnabled: true }));

beforeEach(() => {
  vi.resetModules();
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
});
describe("local form definitions", () => {
  it("duplicates sections with fresh field IDs and remapped internal conditions", async () => {
    const { createTemplate, duplicateSection } = await import("./store");
    const original = createTemplate("Event Interest");
    original.fields[1].condition = {
      fieldId: original.fields[0].id,
      value: "Sample",
    };
    const copy = duplicateSection(original, original.sections[0].id),
      copiedFields = copy.fields.filter(
        (field) => field.sectionId === copy.sections[1].id,
      );
    expect(copy.sections).toHaveLength(2);
    expect(copiedFields).toHaveLength(original.fields.length);
    expect(copiedFields[0].id).not.toBe(original.fields[0].id);
    expect(copiedFields[1].condition?.fieldId).toBe(copiedFields[0].id);
  });
  it("supports all 23 field types and creates response-free templates", async () => {
    const store = await import("./store");
    expect(store.fieldTypes).toHaveLength(23);
    for (const title of [
      "Event Interest",
      "Event Feedback",
      "Volunteer Signup",
      "Team Application",
      "General Survey",
    ]) {
      const form = store.createTemplate(title);
      expect(form.title).toContain(title);
      expect(store.validateDefinition(form)).toEqual([]);
    }
    expect(store.formsStore.getResponses()).toEqual([]);
  });
  it("persists fixture IDs so deep links survive a reload", async () => {
    const first = await import("./store");
    const initialId = first.formsStore.getForms()[0].id;
    vi.resetModules();
    const reloaded = await import("./store");
    expect(reloaded.formsStore.getForms()[0].id).toBe(initialId);
  });
  it("publishes immutable snapshots without changing historical labels", async () => {
    const { formsStore, createTemplate } = await import("./store");
    const draft = createTemplate("General Survey");
    const first = formsStore.publish(draft);
    const originalLabel = first.versions[0].fields[0].label;
    first.fields[0].label = "Edited draft label";
    const second = formsStore.publish(first);
    expect(second.versions).toHaveLength(2);
    expect(second.versions[0].fields[0].label).toBe(originalLabel);
    expect(second.versions[1].fields[0].label).toBe("Edited draft label");
    second.fields[0].label = "Later draft";
    expect(second.versions[1].fields[0].label).toBe("Edited draft label");
  });
  it("does not duplicate a response when the same local response is edited", async () => {
    const { formsStore } = await import("./store");
    const response = {
      id: "sample",
      formId: "form",
      version: 1,
      submittedAt: new Date().toISOString(),
      answers: { question: "First" },
    };
    formsStore.submit(response);
    formsStore.submit({ ...response, answers: { question: "Updated" } });
    expect(formsStore.getResponses()).toHaveLength(1);
    expect(formsStore.getResponses()[0].answers.question).toBe("Updated");
    expect(formsStore.getResponses()[0].revisions?.[0].answers.question).toBe(
      "First",
    );
  });
  it("redacts identity and sensitive values from current and historical revisions", async () => {
    const { formsStore, createTemplate } = await import("./store");
    const form = formsStore.publish(createTemplate("Event Interest"));
    const answers = {
      [form.fields[0].id]: "Sample Builder",
      [form.fields[1].id]: "sample@example.test",
      [form.fields[2].id]: "Just getting started",
    };
    const response = {
      id: "redact-test",
      formId: form.id,
      version: 1,
      submittedAt: new Date().toISOString(),
      answers,
    };
    formsStore.submit(response);
    formsStore.submit(response);
    formsStore.redact(response.id);
    const saved = formsStore.getResponses()[0];
    expect(saved.answers[form.fields[0].id]).toBe("[Identity redacted]");
    expect(saved.answers[form.fields[1].id]).toBe("[Identity redacted]");
    expect(saved.revisions?.[0].answers[form.fields[0].id]).toBe(
      "[Identity redacted]",
    );
    expect(saved.answers[form.fields[2].id]).toBe("Just getting started");
  });
  it("duplicates the draft with a new identity and no published versions", async () => {
    const { formsStore, createTemplate } = await import("./store");
    const original = formsStore.publish(createTemplate("General Survey"));
    const copy = formsStore.duplicate(original);
    expect(copy.id).not.toBe(original.id);
    expect(copy.slug).not.toBe(original.slug);
    expect(copy.status).toBe("Draft");
    expect(copy.versions).toEqual([]);
  });
  it("rejects forward/cyclic conditions and blank condition answers", async () => {
    const { createTemplate, validateDefinition } = await import("./store");
    const form = createTemplate("Event Interest");
    form.fields[0].condition = { fieldId: form.fields[1].id, value: "" };
    expect(validateDefinition(form).join(" ")).toContain("avoid cycles");
    expect(validateDefinition(form).join(" ")).toContain("matching answer");
  });
  it("hides downstream fields when their source field is hidden", async () => {
    const { newField, visibleFields } = await import("./store");
    const first = newField("radio", "section"),
      second = newField("radio", "section"),
      third = newField("short", "section");
    second.condition = { fieldId: first.id, value: "yes" };
    third.condition = { fieldId: second.id, value: "yes" };
    expect(
      visibleFields([first, second, third], {
        [first.id]: "no",
        [second.id]: "yes",
      }).map((field) => field.id),
    ).toEqual([first.id]);
    expect(
      visibleFields([first, second, third], {
        [first.id]: ["yes"],
        [second.id]: "yes",
      }),
    ).toHaveLength(3);
  });
});

describe("respondent validation", () => {
  it("validates text, ranges, domains, choices, grids, and safe URLs", async () => {
    const { newField, validateAnswer } = await import("./store");
    const text = {
      ...newField("short", "s"),
      required: true,
      minLength: 3,
      maxLength: 8,
    };
    expect(validateAnswer(text, "   ")).toContain("Please answer");
    expect(validateAnswer(text, "AB")).toContain("at least 3");
    expect(validateAnswer(text, "A long answer")).toContain("no more than 8");
    expect(validateAnswer(text, "Valid")).toBeNull();
    expect(
      validateAnswer(
        { ...newField("email", "s"), allowedDomain: "gatech.edu" },
        "sample@example.test",
      ),
    ).toContain("gatech.edu");
    expect(
      validateAnswer({ ...newField("number", "s"), min: 2, max: 5 }, "8"),
    ).toContain("allowed range");
    expect(
      validateAnswer({ ...newField("checkbox", "s"), maxChoices: 1 }, [
        "A",
        "B",
      ]),
    ).toContain("no more than 1");
    expect(
      validateAnswer(
        { ...newField("grid", "s"), required: true, options: ["A", "B"] },
        { A: ["Agree"] },
      ),
    ).toContain("each row");
    expect(
      validateAnswer(newField("url", "s"), "javascript:alert(1)"),
    ).toContain("http or https");
    expect(
      validateAnswer(newField("url", "s"), "https://example.test/"),
    ).toBeNull();
  });
});
