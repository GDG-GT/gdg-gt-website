import { describe, it, expect } from "vitest";
import {
  createTemplate,
  newField,
  formDefinitionSchema,
} from "../shared/forms";
import {
  canShuffleQuestions,
  presentationFields,
} from "../shared/form-presentation";
function fixture() {
  const form = createTemplate("Fictional presentation form");
  form.fields = Array.from({ length: 7 }, (_, index) => ({
    ...newField("short", form.sections[0].id),
    label: "Question " + index,
  }));
  return form;
}
describe("FORM-007 version-safe presentation settings", () => {
  it("repeats the same attempt order, varies independent attempts and never changes canonical definitions", () => {
    const f = fixture(),
      original = JSON.stringify(f),
      settings = { ...f.settings, shuffleQuestions: true };
    const first = presentationFields(
      f.fields,
      f.sections,
      settings,
      "attempt-a",
    ).map((field) => field.id);
    expect(first).toEqual(
      presentationFields(f.fields, f.sections, settings, "attempt-a").map(
        (field) => field.id,
      ),
    );
    expect(
      new Set(
        Array.from({ length: 8 }, (_, index) =>
          presentationFields(f.fields, f.sections, settings, "attempt-" + index)
            .map((field) => field.id)
            .join(","),
        ),
      ).size,
    ).toBeGreaterThan(1);
    expect(new Set(first)).toEqual(new Set(f.fields.map((field) => field.id)));
    expect(JSON.stringify(f)).toBe(original);
  });
  it("never crosses content blocks or section boundaries", () => {
    const f = fixture(),
      second = { id: crypto.randomUUID(), title: "Second", description: "" };
    f.sections.push(second);
    const divider = newField("description", f.sections[0].id);
    f.fields.splice(3, 0, divider);
    f.fields.push(
      ...Array.from({ length: 4 }, () => newField("short", second.id)),
    );
    const result = presentationFields(
      f.fields,
      f.sections,
      { ...f.settings, shuffleQuestions: true },
      "seed",
    );
    expect(result[3].id).toBe(divider.id);
    expect(new Set(result.slice(0, 3).map((field) => field.id))).toEqual(
      new Set(f.fields.slice(0, 3).map((field) => field.id)),
    );
    expect(
      result.slice(8).every((field) => field.sectionId === second.id),
    ).toBe(true);
    expect(
      presentationFields(
        [],
        [],
        { ...f.settings, shuffleQuestions: true },
        "seed",
      ),
    ).toEqual([]);
  });
  it("fails safe on conditional/branching historical definitions even before publication validation", () => {
    const f = fixture();
    f.fields[1].condition = { fieldId: f.fields[0].id, value: "Yes" };
    expect(canShuffleQuestions(f.fields, f.sections)).toBe(false);
    expect(
      presentationFields(
        f.fields,
        f.sections,
        { ...f.settings, shuffleQuestions: true },
        "seed",
      ).map((field) => field.id),
    ).toEqual(f.fields.map((field) => field.id));
    delete f.fields[1].condition;
    f.sections[0].rules = [
      {
        id: crypto.randomUUID(),
        fieldId: f.fields[0].id,
        value: "Yes",
        target: "end",
      },
    ];
    expect(canShuffleQuestions(f.fields, f.sections)).toBe(false);
  });
  it("pairs stable option IDs, anchors escape choices and preserves ordinal/relative-position fields", () => {
    const f = fixture(),
      choice = newField("radio", f.sections[0].id);
    choice.options = [
      "Cloud",
      "Web",
      "Mobile",
      "Other",
      "Prefer not to answer",
    ];
    choice.optionIds = choice.options.map(() => crypto.randomUUID());
    const ranking = {
      ...newField("ranking", f.sections[0].id),
      options: ["One", "Two", "Three"],
    };
    const relative = {
      ...newField("dropdown", f.sections[0].id),
      options: ["Cloud", "Web", "All of the above"],
    };
    const fields = [choice, ranking, relative],
      result = presentationFields(
        fields,
        f.sections,
        { ...f.settings, shuffleOptions: true },
        "options",
      );
    expect(result[0].options.slice(-2)).toEqual([
      "Other",
      "Prefer not to answer",
    ]);
    for (let i = 0; i < result[0].options.length; i++)
      expect(result[0].optionIds?.[i]).toBe(
        choice.optionIds[choice.options.indexOf(result[0].options[i])],
      );
    expect(result[1]).toBe(ranking);
    expect(result[2]).toBe(relative);
    expect(choice.options[0]).toBe("Cloud");
    const noIds = { ...choice, optionIds: undefined };
    expect(
      presentationFields(
        [noIds],
        f.sections,
        { ...f.settings, shuffleOptions: true },
        "options",
      )[0].optionIds,
    ).toBeUndefined();
  });
  it("keeps settings backwards compatible while refusing arbitrary theme/CSS injection and nonboolean progress", () => {
    const f = fixture(),
      document = {
        title: f.title,
        description: f.description,
        fields: f.fields,
        sections: f.sections,
        settings: f.settings,
      };
    expect(formDefinitionSchema.safeParse(document).success).toBe(true);
    for (const theme of ["coral", "charcoal"])
      expect(
        formDefinitionSchema.safeParse({
          ...document,
          settings: { ...f.settings, theme, progress: false },
        }).success,
      ).toBe(true);
    expect(
      formDefinitionSchema.safeParse({
        ...document,
        settings: { ...f.settings, theme: "url(https://outside.example.test)" },
      }).success,
    ).toBe(false);
    expect(
      formDefinitionSchema.safeParse({
        ...document,
        settings: { ...f.settings, progress: "false" },
      }).success,
    ).toBe(false);
  });
});
