import { describe, it, expect } from "vitest";
import { z } from "zod";
import { validationMessage } from "../../src/lib/validationMessage.ts";
describe("readable form validation", () => {
  it("associates the first validation issue with a human field label", () => {
    const r = z
      .object({ record: z.object({ title: z.string().min(2) }) })
      .safeParse({ record: { title: "" } });
    expect(
      validationMessage(r.error, "Try again", { "record.title": "Task title" }),
    ).toMatch(/^Task title: /);
    expect(validationMessage(r.error, "Try again")).not.toContain('"code"');
  });
  it("preserves protected API error explanations", () => {
    expect(
      validationMessage(
        new Error("This record changed. Reload before saving."),
        "Try again",
      ),
    ).toBe("This record changed. Reload before saving.");
  });
  it("uses a safe fallback for unrecognized failures", () => {
    expect(
      validationMessage(
        { secret: "never display arbitrary objects" },
        "Please try again.",
      ),
    ).toBe("Please try again.");
  });
});
