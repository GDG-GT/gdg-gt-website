import { describe, expect, it } from "vitest";
import { createTemplate } from "../../../shared/forms";
import { compareFormDefinitions } from "../../../shared/form-history";
describe("immutable form definition comparisons", () => {
  it("does not mutate either snapshot and compares stable identities rather than labels", () => {
    const before = createTemplate("Fictional comparison"), after = structuredClone(before);
    after.fields[0].label = "Changed label";
    after.fields.reverse();
    after.settings.limit = 100;
    const result = compareFormDefinitions(before, after);
    expect(result.added).toEqual([]); expect(result.removed).toEqual([]);
    expect(result.changed.map((f) => f.id)).toEqual([before.fields[0].id]);
    expect(result.reordered.length).toBeGreaterThan(0);
    expect(result.settingsChanged).toBe(true);
    expect(before.fields[0].label).not.toBe("Changed label");
  });
  it("detects replacement fields even when their labels match", () => {
    const before = createTemplate("Fictional comparison"), after = structuredClone(before);
    after.fields[0].id = crypto.randomUUID();
    const result = compareFormDefinitions(before, after);
    expect(result.added).toHaveLength(1); expect(result.removed).toHaveLength(1);
    expect(result.changed).toHaveLength(0);
  });
  it("ignores JSON object property order but detects validation and branching changes", () => {
    const before = createTemplate("Fictional comparison"), after = structuredClone(before);
    after.fields[0] = Object.fromEntries(Object.entries(after.fields[0]).reverse()) as typeof after.fields[0];
    expect(compareFormDefinitions(before, after).changed).toEqual([]);
    after.fields[0].maxLength = 20;
    after.sections[0].next = "end";
    expect(compareFormDefinitions(before, after).changed).toHaveLength(1);
    expect(compareFormDefinitions(before, after).sectionsChanged).toBe(true);
  });
});
