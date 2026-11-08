// @vitest-environment jsdom
import React, { useState } from "react";
import {
  render,
  screen,
  fireEvent,
  cleanup,
} from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import FieldRenderer from "../../src/ui/forms/FieldRenderer";
import { newField, type Answer, type FormField } from "../../shared/forms";
import { reviewAnswer } from "../../src/ui/forms/review-answer";
afterEach(cleanup);
function Question({
  type = "radio",
  initial,
}: {
  type?: "radio" | "checkbox";
  initial?: Answer;
}) {
  const [value, setValue] = useState<Answer | undefined>(initial);
  const field: FormField = {
    ...newField(type, "section"),
    id: "choice",
    label: "Your interests",
    options: ["Code", "Other"],
  };
  return (
    <>
      <FieldRenderer field={field} value={value} onChange={setValue} />
      <output aria-label="Recorded answer">{JSON.stringify(value)}</output>
    </>
  );
}
describe("Other write-in controls", () => {
  it("opens the radio write-in, records its text, and clears it when a regular option is selected", () => {
    render(<Question />);
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Other", exact: true }));
    const input = screen.getByRole("textbox", {
      name: "Your interests: Other answer",
    }) as HTMLInputElement;
    expect(input.required).toBe(true);
    fireEvent.change(input, { target: { value: "Robotics" } });
    expect(
      JSON.parse(screen.getByLabelText("Recorded answer").textContent!),
    ).toEqual({ kind: "choice_other", selected: "Other", other: "Robotics" });
    fireEvent.click(screen.getByRole("radio", { name: "Code", exact: true }));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      JSON.parse(screen.getByLabelText("Recorded answer").textContent!),
    ).toBe("Code");
  });
  it("keeps normal multi-select choices alongside Other and removes only the deselected detail", () => {
    render(<Question type="checkbox" />);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Code", exact: true }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Other", exact: true }),
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Design" },
    });
    expect(
      JSON.parse(screen.getByLabelText("Recorded answer").textContent!),
    ).toEqual({
      kind: "choice_other",
      selected: ["Code", "Other"],
      other: "Design",
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Other", exact: true }),
    );
    expect(
      JSON.parse(screen.getByLabelText("Recorded answer").textContent!),
    ).toEqual(["Code"]);
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("restores a saved Other answer and presents the same text in the respondent review", () => {
    const answer = {
      kind: "choice_other",
      selected: "Other",
      other: "Cloud engineering",
    };
    render(<Question initial={answer} />);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
      "Cloud engineering",
    );
    expect(
      (
        screen.getByRole("radio", {
          name: "Other",
          exact: true,
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(reviewAnswer(answer, "radio", {})).toBe("Other: Cloud engineering");
  });
});
