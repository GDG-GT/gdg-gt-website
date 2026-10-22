import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  conditionValues,
  createTemplate,
  formDefinitionSchema,
  formTemporalValue,
  newField,
  validateAnswer,
} from "../shared/forms";
import FieldRenderer from "../src/ui/forms/FieldRenderer";
import RespondentFileField from "../src/ui/forms/RespondentFileField";

describe("FORM-004/012/026 precise typed answers and accessible controls", () => {
  it("rejects normalized dates, offsets and trailing date-time text without using local timezones", () => {
    for (const value of [
      "2026-02-30T12:30",
      "2025-02-29T12:30",
      "2026-10-22T24:00",
      "2026-10-22T12:60",
      "2026-10-22T12:00Z",
      "2026-10-22T12:00+02:00",
      "2026-10-22T12:00 trailing",
      "2026-10-22T12:00:60",
    ])
      expect(formTemporalValue("datetime", value)).toBeUndefined();
    expect(formTemporalValue("datetime", "2024-02-29T12:30")).toBe(
      "2024-02-29T12:30:00.000",
    );
    expect(formTemporalValue("datetime", "2026-03-08T02:30")).toBe(
      "2026-03-08T02:30:00.000",
    ); // wall time, not a promised timezone
    expect(formTemporalValue("date", "2026-10-22")).toBe("2026-10-22");
    expect(formTemporalValue("date", "2026-10-22T12:00")).toBeUndefined();
  });
  it("compares equivalent datetime precisions and inclusive millisecond bounds consistently", () => {
    const field = {
      ...newField("datetime", "s"),
      dateFrom: "2026-10-22T12:30",
      dateTo: "2026-10-22T12:31:00.1",
    };
    for (const value of [
      "2026-10-22T12:30",
      "2026-10-22T12:30:00",
      "2026-10-22T12:31:00.100",
    ])
      expect(validateAnswer(field, value)).toBeNull();
    for (const value of [
      "2026-10-22T12:29:59.999",
      "2026-10-22T12:31:00.101",
      "2026-02-30T12:30",
    ])
      expect(validateAnswer(field, value)).not.toBeNull();
  });
  it("refuses impossible or reversed temporal settings at publication while retaining unfinished drafts", () => {
    const f = createTemplate("Fictional temporal validation", "blank"),
      field = f.fields[0];
    field.type = "datetime";
    const document = () => ({
      title: f.title,
      description: f.description,
      fields: f.fields,
      sections: f.sections,
      settings: f.settings,
    });
    field.dateFrom = "2026-02-30T12:00";
    expect(formDefinitionSchema.safeParse(document()).success).toBe(false);
    field.dateFrom = "2026-10-23T12:00";
    field.dateTo = "2026-10-22T12:00";
    expect(formDefinitionSchema.safeParse(document()).success).toBe(false);
    field.dateTo = "2026-10-23T12:00:00";
    expect(formDefinitionSchema.safeParse(document()).success).toBe(true);
  });
  it("accepts only displayed integer scores and never allocates an unbounded draft scale", () => {
    const field = { ...newField("rating", "s"), min: 0, max: 10 };
    expect(conditionValues(field)).toHaveLength(11);
    for (const value of ["0", "5", "10"])
      expect(validateAnswer(field, value)).toBeNull();
    for (const value of ["2.5", "01", "1e0", "-1", "11", " 1 "])
      expect(validateAnswer(field, value)).not.toBeNull();
    for (const bounds of [
      { min: 1.5, max: 5 },
      { min: -1, max: 5 },
      { min: 1, max: 1e30 },
      { min: 4, max: 3 },
    ])
      expect(conditionValues({ ...field, ...bounds })).toEqual([]);
    const f = createTemplate("Fictional bounded scale", "blank");
    f.fields[0] = { ...f.fields[0], type: "scale", min: 1, max: 1000000 };
    expect(
      formDefinitionSchema.safeParse({
        title: f.title,
        description: f.description,
        fields: f.fields,
        sections: f.sections,
        settings: f.settings,
      }).success,
    ).toBe(false);
  });
  it("accepts finite decimal/exponent numbers but not alternate-radix or non-finite strings", () => {
    const field = newField("number", "s");
    for (const value of ["0", "-2.5", ".25", "1e2", "+3"])
      expect(validateAnswer(field, value)).toBeNull();
    for (const value of ["0x10", "0b10", "0o10", "Infinity", "NaN", "1e9999"])
      expect(validateAnswer(field, value)).not.toBeNull();
  });
  it("preserves exact choice strings so whitespace never changes branching identity", () => {
    const field = { ...newField("radio", "s"), options: [" A ", "B"] };
    expect(validateAnswer(field, " A ")).toBeNull();
    expect(validateAnswer(field, "A")).not.toBeNull();
    expect(validateAnswer({ ...field, type: "dropdown" }, " A ")).toBeNull();
  });
  it("renders single-choice scale/rating as native labelled radios with checked/error/help semantics", () => {
    const field = {
      ...newField("rating", "s"),
      required: true,
      description: "Choose one score",
    };
    const markup = renderToStaticMarkup(
      createElement(FieldRenderer, {
        field,
        value: "3",
        error: "Choose a score",
        onChange: () => {},
      }),
    );
    expect(markup.match(/type="radio"/g) || []).toHaveLength(5);
    expect(markup.match(/checked=""/g) || []).toHaveLength(1);
    expect(markup).toContain('aria-label="3 of 5"');
    expect(markup).toContain(
      `aria-describedby="field-${field.id}-help field-${field.id}-error"`,
    );
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).not.toContain("aria-pressed");
  });
  it("labels file controls through a focusable fieldset legend and associates every error source", () => {
    const field = {
      ...newField("file", "s"),
      required: true,
      description: "PDF only",
    };
    const fileControl = createElement(RespondentFileField, {
      field,
      value: [],
      context: {
        slug: "fictional",
        versionId: crypto.randomUUID(),
        uploadToken: "fictional-not-a-real-token",
      },
      onChange: () => {},
      onName: () => {},
      onBusy: () => {},
      error: "Choose a file",
    });
    const markup = renderToStaticMarkup(
      createElement(FieldRenderer, {
        field,
        error: "Choose a file",
        onChange: () => {},
        fileControl,
      }),
    );
    expect(markup).toContain(
      `<fieldset class="gt-rendered-field" id="field-${field.id}" tabindex="-1"`,
    );
    expect(markup).toContain(`id="field-${field.id}-upload"`);
    expect(markup).toContain(`aria-labelledby="field-${field.id}-label"`);
    expect(markup).toContain(`field-${field.id}-help field-${field.id}-error`);
    expect(markup).toContain('aria-required="true"');
    expect(markup).toContain('aria-invalid="true"');
  });
});
