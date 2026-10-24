import { describe, expect, it } from "vitest";
import { z } from "zod";
import { boardDocument } from "../../shared/whiteboards.mjs";
describe("SEC-TEST-024: bounded validation collection failures", () => {
  it("stops oversized constrained arrays before accumulating per-element failures", () => {
    const result = z
      .array(z.object({ value: z.string() }))
      .max(2)
      .safeParse(Array.from({ length: 10000 }, () => ({ value: 1 })));
    expect(result.success).toBe(false);
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0].code).toBe("too_big");
  });
  it("still validates record values in whiteboard elements rather than treating them as keys", () => {
    const rectangle = {
      id: "fictional",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      angle: 0,
      strokeColor: "#2d2d2d",
      backgroundColor: "transparent",
    };
    const doc = {
      elements: [rectangle],
      appState: { viewBackgroundColor: "#f2f3f5" },
    };
    expect(boardDocument.safeParse(doc).success).toBe(true);
    expect(
      boardDocument.safeParse({
        ...doc,
        elements: [{ ...rectangle, type: "script" }],
      }).success,
    ).toBe(false);
  });
});
