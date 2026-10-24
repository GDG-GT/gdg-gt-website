import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createTemplate,
  newField,
  formDefinitionSchema,
  validateAnswer,
  validateDefinition,
  type FormField,
} from "../shared/forms";
import FieldValidationSettings from "../src/ui/forms/FieldValidationSettings";
const render = (field: FormField) =>
  renderToStaticMarkup(
    createElement(FieldValidationSettings, { field, onChange: () => {} }),
  );
const definition = (field: FormField) => {
  const f = createTemplate("Validation controls", "blank");
  return {
    title: f.title,
    description: f.description,
    fields: [{ ...field, sectionId: f.sections[0].id }],
    sections: f.sections,
    settings: f.settings,
  };
};
describe("FORM-004 configured builder validation", () => {
  it("exposes bounded file count, precise byte size and the entire supported format allowlist", () => {
    const html = render(newField("file", crypto.randomUUID()));
    for (const label of [
      "Maximum files",
      "Maximum file size (MiB)",
      "Allowed file types",
      "PDF",
      "Word (.docx)",
      "Plain text (.txt)",
      "PNG",
      "JPEG",
      "WebP",
    ])
      expect(html).toContain(label);
    expect(html.match(/type="checkbox"[^>]*checked/g)).toHaveLength(6);
    expect(html).toContain('min="1" max="10"');
    expect(html).toContain('max="25"');
    expect(html).not.toContain("SVG");
  });
  it("renders saved file policy and cannot deselect its last permitted format", () => {
    const field = {
      ...newField("file", crypto.randomUUID()),
      maxFiles: 3,
      maxFileBytes: 1572864,
      allowedMime: ["application/pdf"],
    };
    const html = render(field);
    expect(html).toContain('value="3"');
    expect(html).toContain('value="1.5"');
    expect(html.match(/type="checkbox"[^>]*checked/g)).toHaveLength(1);
    expect(html).toContain('disabled="" checked=""');
    expect(formDefinitionSchema.safeParse(definition(field)).success).toBe(
      true,
    );
    for (const values of [
      { maxFiles: 11 },
      { maxFiles: 1.5 },
      { maxFileBytes: 26214401 },
      { maxFileBytes: 0 },
      { allowedMime: [] },
      { allowedMime: ["image/svg+xml"] },
    ])
      expect(
        formDefinitionSchema.safeParse(definition({ ...field, ...values }))
          .success,
      ).toBe(false);
  });
  it("supports safe patterns for text fields with associated live errors for unsafe expressions", () => {
    for (const type of ["short", "long", "email", "phone", "url"] as const)
      expect(render(newField(type, crypto.randomUUID()))).toContain(
        "Required answer pattern",
      );
    const field = {
      ...newField("short", crypto.randomUUID()),
      pattern: "^[A-Z0-9]+$",
    };
    expect(formDefinitionSchema.safeParse(definition(field)).success).toBe(
      true,
    );
    expect(validateAnswer(field, "GDG2026")).toBeNull();
    expect(validateAnswer(field, "not valid")).not.toBeNull();
    expect(render(field)).toContain('aria-invalid="false"');
    const unsafe = { ...field, pattern: "^(a+)+$" },
      html = render(unsafe);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain(`pattern-error-${field.id}`);
    expect(html).toContain('role="alert"');
    expect(formDefinitionSchema.safeParse(definition(unsafe)).success).toBe(
      false,
    );
    const form = createTemplate("Fictional invalid pattern", "blank");
    form.fields[0].pattern = "^(a+)+$";
    expect(validateDefinition(form).join(" ")).toContain(
      "supported anchored answer pattern",
    );
    form.fields[0] = {
      ...form.fields[0],
      type: "file",
      pattern: undefined,
      maxFiles: 11,
    };
    expect(validateDefinition(form).join(" ")).toContain(
      "file count and size limits",
    );
  });
  it("does not add unrelated text/file settings to choice or content blocks", () => {
    for (const type of ["radio", "number", "image", "divider", "date"] as const)
      expect(render(newField(type, crypto.randomUUID()))).toBe("");
  });
});
