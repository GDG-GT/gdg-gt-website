import { describe, it, expect } from "vitest";
import {
  createTemplate,
  newField,
  validateAnswer,
  validateSubmission,
  visibleFields,
  formPath,
  formDefinitionSchema,
} from "../../shared/forms.ts";
import { otherChoiceText } from "../../shared/form-choice.ts";
import { safeCell } from "../../shared/form-export.ts";
import { responseCopyText } from "../../shared/form-respondent.mjs";
import { summarizeResponses } from "../../server/form-responses.mjs";
import { fixture } from "./form-routes-fixture.mjs";
const question = (type = "radio") => ({
  ...newField(type, "section"),
  options: ["Option A", "Other"],
  required: true,
});
const detail = (selected = "Other", other = "My own answer") => ({
  kind: "choice_other",
  selected,
  other,
});
describe("Other choice answers", () => {
  it("accepts radio and multi-select details while preserving ordinary answers", () => {
    expect(validateAnswer(question(), detail())).toBeNull();
    expect(
      validateAnswer(question("checkbox"), detail(["Option A", "Other"])),
    ).toBeNull();
    expect(validateAnswer(question(), "Option A")).toBeNull();
    expect(validateAnswer(question("checkbox"), ["Option A"])).toBeNull();
  });
  it("requires text only when Other is selected, including on optional questions", () => {
    for (const type of ["radio", "checkbox"]) {
      const q = { ...question(type), required: false };
      const selected = type === "radio" ? "Other" : ["Other"];
      expect(validateAnswer(q, detail(selected, ""))).toContain(
        "Please specify",
      );
      expect(validateAnswer(q, selected)).toContain("Please specify");
      expect(validateAnswer(q, detail(selected, ""), true)).toBeNull();
    }
  });
  it("rejects incorrect shapes, unlisted choices, duplicate selections, oversized text and spoofed Other fields", () => {
    for (const [q, value] of [
      [question(), detail(["Other"])],
      [question("checkbox"), detail("Other")],
      [question(), detail("Unknown")],
      [question(), detail("Option A")],
      [question("checkbox"), detail(["Other", "Other"])],
      [question(), detail("Other", "x".repeat(301))],
      [question(), detail("Other", "bad\u0000value")],
      [question(), { ...detail(), injected: "value" }],
      [{ ...question(), options: ["Option A"] }, detail()],
    ])
      expect(validateAnswer(q, value)).not.toBeNull();
    expect(
      validateAnswer(
        { ...question("checkbox"), maxChoices: 1 },
        detail(["Option A", "Other"]),
      ),
    ).toContain("no more than 1");
  });
  it("keeps Other conditions and section branching attached to the selected option", () => {
    const form = createTemplate("Other conditions", "blank");
    const q = { ...question(), sectionId: form.sections[0].id };
    const follow = {
      ...newField("short", q.sectionId),
      condition: { fieldId: q.id, value: "Other" },
    };
    form.fields = [q, follow];
    const answers = { [q.id]: detail(), [follow.id]: "Follow-up" };
    expect(visibleFields(form.fields, answers)).toEqual([q, follow]);
    expect(validateSubmission(form, answers)).toEqual({});
    form.sections.push({
      id: "next-section",
      title: "Other section",
      description: "",
    });
    form.sections[0].next = "end";
    form.sections[0].rules = [
      { id: "rule", fieldId: q.id, value: "Other", target: "next-section" },
    ];
    expect(formPath(form, answers).sections.map((x) => x.id)).toContain(
      "next-section",
    );
  });
  it("retains text in respondent copies and readable spreadsheet cells without leaking it into count labels", () => {
    const answer = detail(["Option A", "Other"], "Robotics");
    expect(otherChoiceText(answer)).toBe("Option A, Other: Robotics");
    expect(safeCell(answer)).toBe("Option A, Other: Robotics");
    const text = responseCopyText({
      title: "Fixture",
      version: 1,
      submittedAt: "2026-11-08T12:00:00Z",
      name: "Fictional Person",
      email: "person@example.test",
      responseId: "fixture",
      answers: [{ label: "Interests", value: answer }],
    });
    expect(text).toContain("Option A, Other: Robotics");
    expect(text).not.toContain("choice_other");
    const field = question("checkbox");
    const summaries = summarizeResponses(
      [{ version: 1, answers: { [field.id]: answer } }],
      [{ version: 1, definition: { fields: [field] } }],
    );
    expect(summaries.fields[0].counts).toEqual({ "Option A": 1, Other: 1 });
  });
  it("accepts full structured answers through the actual submission handler and preserves every selected option", async () => {
    const f = fixture();
    const q = f.definition.fields[0];
    Object.assign(q, {
      type: "checkbox",
      options: [
        ...Array.from({ length: 32 }, (_, i) => "Choice " + i),
        "Other",
      ],
    });
    q.optionIds = q.options.map(() => crypto.randomUUID());
    const parsed = formDefinitionSchema.safeParse(f.definition);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    const answer = detail([...q.options], "Something else");
    const r = await f.call(
      "/forms/fictional-route-fixture/submissions",
      "POST",
      { ...f.submission, answers: { [q.id]: answer } },
    );
    expect(r.statusCode, JSON.stringify(r.body)).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledWith(
      "submit_identified_form_response",
      expect.objectContaining({
        p_document: expect.objectContaining({ answers: { [q.id]: answer } }),
      }),
    );
  });
});
