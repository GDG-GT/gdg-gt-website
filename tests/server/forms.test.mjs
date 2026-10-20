import { describe, it, expect } from "vitest";
import {
  createTemplate,
  newField,
  formDefinitionSchema,
  validateSubmission,
  validateAnswer,
  safePattern,
} from "../../shared/forms.ts";
import { projectResponse } from "../../server/forms.mjs";
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
  it("omits sensitive answers and all response tokens from default projections", () => {
    const d = definition();
    d.fields[0].sensitive = true;
    const response = {
      id: "r",
      form_id: "f",
      version_id: "v",
      version: 1,
      status: "complete",
      submitted_at: "now",
      edit_token_hash: "never-expose",
    };
    const answers = [
      { field_id: d.fields[0].id, value: "Private Name" },
      { field_id: d.fields[1].id, value: "sample@example.test" },
    ];
    const hidden = projectResponse(response, answers, d);
    expect(hidden.answers).not.toHaveProperty(d.fields[0].id);
    expect(JSON.stringify(hidden)).not.toContain("never-expose");
    expect(
      projectResponse(response, answers, d, true).answers[d.fields[0].id],
    ).toBe("Private Name");
  });
});
