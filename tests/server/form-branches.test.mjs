import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createTemplate,
  newField,
  formDefinitionSchema,
  formPath,
  validateSubmission,
  duplicateSection,
} from "../../shared/forms.ts";
function fixture() {
  const f = createTemplate("Branch fixture"),
    second = { id: randomUUID(), title: "Details", description: "" },
    third = { id: randomUUID(), title: "Closing", description: "" };
  f.sections.push(second, third);
  const detail = newField("short", second.id),
    last = newField("short", third.id);
  detail.required = true;
  last.required = true;
  f.fields.push(detail, last);
  const choice = f.fields[2];
  f.sections[0].rules = [
    {
      id: randomUUID(),
      fieldId: choice.id,
      value: choice.options[0],
      target: third.id,
    },
  ];
  const answers = {
    [f.fields[0].id]: "Fictional Person",
    [f.fields[1].id]: "fictional@example.test",
    [choice.id]: choice.options[0],
    [last.id]: "Finished",
  };
  return { f, second, third, detail, last, choice, answers };
}
describe("shared section branching and end-form rules", () => {
  it("uses the same reachable sections and required fields in browser and server", () => {
    const { f, second, third, detail, answers } = fixture();
    expect(formDefinitionSchema.safeParse(f).success).toBe(false); // Runtime metadata is not accepted as a definition.
    const { title, description, fields, sections, settings } = f,
      definition = { title, description, fields, sections, settings };
    expect(formDefinitionSchema.safeParse(definition).success).toBe(true);
    expect(formPath(f, answers).sections.map((s) => s.id)).toEqual([
      f.sections[0].id,
      third.id,
    ]);
    expect(validateSubmission(f, answers)).toEqual({});
    expect(
      validateSubmission(f, { ...answers, [detail.id]: "Hidden bypass" }),
    ).toHaveProperty(detail.id);
    expect(formPath(f, {}).sections.map((s) => s.id)).toContain(second.id);
  });
  it("ends early without demanding or retaining later answers", () => {
    const { f, choice, answers, last } = fixture();
    f.sections[0].rules[0].target = "end";
    expect(formPath(f, answers).ended).toBe(true);
    expect(formPath(f, answers).sections).toHaveLength(1);
    const safe = { ...answers };
    delete safe[last.id];
    expect(validateSubmission(f, safe)).toEqual({});
    expect(validateSubmission(f, answers)).toHaveProperty(last.id);
    expect(
      formPath(f, { ...answers, [choice.id]: choice.options[1] }).sections,
    ).toHaveLength(3);
  });
  it("rejects backward cycles, invalid destinations and unreachable sections", () => {
    const { f, second } = fixture(),
      definition = () => ({
        title: f.title,
        description: f.description,
        fields: f.fields,
        sections: f.sections,
        settings: f.settings,
      });
    second.next = f.sections[0].id;
    expect(formDefinitionSchema.safeParse(definition()).success).toBe(false);
    second.next = randomUUID();
    expect(formDefinitionSchema.safeParse(definition()).success).toBe(false);
    delete second.next;
    f.sections[0].next = "end";
    f.sections[0].rules = [];
    expect(formDefinitionSchema.safeParse(definition()).success).toBe(false);
  });
  it("rejects simultaneously matching contradictory routes", () => {
    const { f, choice } = fixture();
    f.sections[0].rules.push({
      id: randomUUID(),
      fieldId: f.fields[3].id,
      value: f.fields[3].options[0],
      target: "end",
    });
    const definition = {
      title: f.title,
      description: f.description,
      fields: f.fields,
      sections: f.sections,
      settings: f.settings,
    };
    expect(formDefinitionSchema.safeParse(definition).success).toBe(false);
    f.sections[0].rules = [
      {
        id: randomUUID(),
        fieldId: choice.id,
        value: "Unavailable option",
        target: "end",
      },
    ];
    expect(formDefinitionSchema.safeParse(definition).success).toBe(false);
  });
  it("preserves safe ordering and remaps local field rules on section duplication", () => {
    const { f } = fixture(),
      duplicated = duplicateSection(f, f.sections[0].id),
      copy = duplicated.sections[1];
    expect(copy.id).not.toBe(f.sections[0].id);
    expect(copy.rules[0].fieldId).not.toBe(f.sections[0].rules[0].fieldId);
    expect(
      duplicated.fields.find((field) => field.id === copy.rules[0].fieldId)
        .sectionId,
    ).toBe(copy.id);
  });
  it("rejects required fields whose visibility answer always branches past them", () => {
    const { f, detail, choice } = fixture();
    detail.condition = { fieldId: choice.id, value: choice.options[0] };
    const { title, description, fields, sections, settings } = f;
    expect(
      formDefinitionSchema.safeParse({
        title,
        description,
        fields,
        sections,
        settings,
      }).success,
    ).toBe(false);
  });
  it("does not mistake an exhaustive required-choice fallback for a reachable section", () => {
    const { f, choice } = fixture();
    f.sections[0].rules = choice.options.map((value) => ({
      id: randomUUID(),
      fieldId: choice.id,
      value,
      target: "end",
    }));
    const { title, description, fields, sections, settings } = f;
    expect(
      formDefinitionSchema.safeParse({
        title,
        description,
        fields,
        sections,
        settings,
      }).success,
    ).toBe(false);
  });
});
