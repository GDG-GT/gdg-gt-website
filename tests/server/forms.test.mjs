import { describe, it, expect } from "vitest";
import {
  createTemplate,
  newField,
  formDefinitionSchema,
  validateSubmission,
  validateAnswer,
  safePattern,
  reconcileOptionIds,
} from "../../shared/forms.ts";
const definition = () => {
  const f = createTemplate("Validation fixture");
  return {
    title: f.title,
    description: f.description,
    fields: f.fields,
    sections: f.sections,
    settings: f.settings,
  };
};
describe("shared first-party form contract", () => {
  it("cannot enable the planned SSO mode or trust an SSO flag in form settings", () => {
    const d = definition();
    expect(
      formDefinitionSchema.safeParse({
        ...d,
        settings: { ...d.settings, access: "georgia-tech-sso-planned" },
      }).success,
    ).toBe(false);
    expect(
      formDefinitionSchema.safeParse({
        ...d,
        settings: { ...d.settings, ssoVerified: true },
      }).success,
    ).toBe(false);
  });
  it("provides five distinct valid structure-only templates and a blank starter", () => {
    const signatures = new Set();
    for (const kind of [
      "interest",
      "feedback",
      "volunteer",
      "application",
      "survey",
      "blank",
    ]) {
      const f = createTemplate("Template " + kind, kind),
        { title, description, fields, sections, settings } = f;
      expect(
        formDefinitionSchema.safeParse({
          title,
          description,
          fields,
          sections,
          settings,
        }).success,
      ).toBe(true);
      signatures.add(fields.map((f) => f.label).join("|"));
      expect(f.versions).toEqual([]);
      expect(f.responseCount).toBeUndefined();
    }
    expect(signatures.size).toBe(6);
  });
  it("preserves stable option identities across simultaneous reorder and rename", () => {
    const result = reconcileOptionIds(["A", "B"], ["a", "b"], ["B", "C"]);
    expect(result[0]).toBe("b");
    expect(new Set(result).size).toBe(2);
    expect(reconcileOptionIds(["A", "B"], ["a", "b"], ["C", "B"])).toEqual([
      "a",
      "b",
    ]);
    expect(reconcileOptionIds(["A", "B"], ["a", "b"], ["B", "A"])).toEqual([
      "b",
      "a",
    ]);
  });
  it("rejects executable/unknown schema and duplicate stable identities", () => {
    let d = definition();
    expect(formDefinitionSchema.safeParse({ ...d, script: "x" }).success).toBe(
      false,
    );
    d.fields[1].id = d.fields[0].id;
    expect(formDefinitionSchema.safeParse(d).success).toBe(false);
    d = definition();
    d.fields[0].condition = { fieldId: d.fields[2].id, value: "yes" };
    expect(formDefinitionSchema.safeParse(d).success).toBe(false);
  });
  it("rejects hidden, unknown and missing fields with browser/server parity", () => {
    const d = definition(),
      branch = newField("short", d.sections[0].id);
    branch.required = true;
    branch.condition = {
      fieldId: d.fields[2].id,
      value: d.fields[2].options[0],
    };
    d.fields.push(branch);
    const valid = {
      [d.fields[0].id]: "Fictional Person",
      [d.fields[1].id]: "sample@example.test",
      [d.fields[2].id]: d.fields[2].options[1],
    };
    expect(validateSubmission(d, valid)).toEqual({});
    expect(
      validateSubmission(d, { ...valid, [branch.id]: "Hidden" }),
    ).toHaveProperty(branch.id);
    expect(validateSubmission(d, { ...valid, unknown: "x" })).toHaveProperty(
      "unknown",
    );
    expect(validateSubmission(d, {})).toHaveProperty(d.fields[0].id);
    expect(validateSubmission(d, {}, true)).toEqual({});
  });
  it("validates typed answers, choice membership, grids, dates, and consent", () => {
    for (const type of ["short", "email", "number", "radio", "consent"])
      expect(
        validateAnswer(newField(type, "s"), ["wrong-shape"]),
      ).not.toBeNull();
    expect(
      validateAnswer(newField("checkbox", "s"), ["not-an-option"]),
    ).not.toBeNull();
    expect(
      validateAnswer(newField("ranking", "s"), ["Option 1"]),
    ).not.toBeNull();
    expect(validateAnswer(newField("date", "s"), "2026-02-31")).not.toBeNull();
    expect(validateAnswer(newField("time", "s"), "99:72")).not.toBeNull();
    expect(validateAnswer(newField("consent", "s"), "Agreed")).toBeNull();
    expect(
      validateAnswer(newField("grid", "s"), {
        "Option 1": ["invented-column"],
      }),
    ).not.toBeNull();
  });
  it("denies unsafe regular expressions and anonymous one-response promises", () => {
    for (const regex of [
      "(a+)+$",
      "^(a|aa)+$",
      "^a+a+$",
      "^a{10000}$",
      "unanchored",
    ])
      expect(safePattern(regex)).toBe(false);
    expect(safePattern("^[A-Z0-9]+$")).toBe(true);
    const d = definition();
    d.settings.oneResponse = true;
    expect(formDefinitionSchema.safeParse(d).success).toBe(false);
  });
});
