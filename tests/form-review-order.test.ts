import { describe, it, expect } from "vitest";
import { orderedFormFields } from "../shared/forms";

describe("Response question order", () => {
  it("uses section order, preserves question order within sections and keeps older unmapped fields", () => {
    const fields = [
      { id: "late-section-first", sectionId: "b" },
      { id: "first-section-first", sectionId: "a" },
      { id: "first-section-second", sectionId: "a" },
      { id: "late-section-second", sectionId: "b" },
      { id: "legacy", sectionId: "old" },
    ];
    expect(orderedFormFields(fields, [{ id: "a" }, { id: "b" }]).map(f => f.id)).toEqual([
      "first-section-first", "first-section-second", "late-section-first", "late-section-second", "legacy",
    ]);
    expect(fields[0].id).toBe("late-section-first");
    expect(orderedFormFields(fields)).toEqual(fields);
  });
});
