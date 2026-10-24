// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import FieldValidationSettings from "../../src/ui/forms/FieldValidationSettings";
import { newField, type FormField } from "../../shared/forms";
afterEach(cleanup);
function Editor({ initial }: { initial: FormField }) {
  const [field, setField] = useState(initial);
  return (
    <>
      <FieldValidationSettings
        field={field}
        onChange={(change) =>
          setField((previous) => ({ ...previous, ...change }))
        }
      />
      <output aria-label="Saved question policy">
        {JSON.stringify(field)}
      </output>
    </>
  );
}
describe("FORM-TEST-032: editable validation settings", () => {
  it("stores fractional MiB as exact bytes and keeps one required file format selected", () => {
    render(<Editor initial={newField("file", "fictional-section")} />);
    fireEvent.change(screen.getByLabelText(/Maximum files/), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText(/Maximum file size/), {
      target: { value: "1.5" },
    });
    for (const name of [
      "Word (.docx)",
      "Plain text (.txt)",
      "PNG",
      "JPEG",
      "WebP",
    ])
      fireEvent.click(screen.getByRole("checkbox", { name, exact: true }));
    const policy = JSON.parse(
      screen.getByRole("status", { name: "Saved question policy" })
        .textContent!,
    );
    expect(policy.maxFiles).toBe(3);
    expect(policy.maxFileBytes).toBe(1572864);
    expect(policy.allowedMime).toEqual(["application/pdf"]);
    expect(
      (
        screen.getByRole("checkbox", {
          name: "PDF",
          exact: true,
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "PNG", exact: true }));
    expect(
      (
        screen.getByRole("checkbox", {
          name: "PDF",
          exact: true,
        }) as HTMLInputElement
      ).disabled,
    ).toBe(false);
  });
  it("associates unsafe-pattern feedback with its own control and removes it after correction", () => {
    render(<Editor initial={newField("short", "fictional-section")} />);
    const input = screen.getByLabelText("Required answer pattern (optional)");
    fireEvent.change(input, { target: { value: "^(a+)+$" } });
    const alert = screen.getByRole("alert");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain(alert.id);
    fireEvent.change(input, { target: { value: "^[A-Z0-9]+$" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(
      JSON.parse(
        screen.getByRole("status", { name: "Saved question policy" })
          .textContent!,
      ).pattern,
    ).toBe("^[A-Z0-9]+$");
    fireEvent.change(input, { target: { value: "" } });
    expect(
      JSON.parse(
        screen.getByRole("status", { name: "Saved question policy" })
          .textContent!,
      ),
    ).not.toHaveProperty("pattern");
  });
  it("restores documented fallback file limits when a custom policy is cleared", () => {
    render(
      <Editor
        initial={{
          ...newField("file", "fictional-section"),
          maxFiles: 3,
          maxFileBytes: 1572864,
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Maximum files/), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText(/Maximum file size/), {
      target: { value: "" },
    });
    expect(
      (screen.getByLabelText(/Maximum files/) as HTMLInputElement).value,
    ).toBe("1");
    expect(
      (screen.getByLabelText(/Maximum file size/) as HTMLInputElement).value,
    ).toBe("25");
  });
});
