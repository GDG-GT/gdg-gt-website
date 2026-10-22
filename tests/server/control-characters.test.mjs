import { describe, it, expect } from "vitest";
import { hasControlCharacters } from "../../server/lib/validation.mjs";
import { validateMediaFile } from "../../server/lib/media-content.mjs";
describe("SEC-TEST-023: filename and header control characters", () => {
  it("rejects every C0 control and DEL without weakening Unicode filenames", () => {
    for (const code of [
      ...Array.from({ length: 32 }, (_, index) => index),
      127,
    ]) {
      const value = "fictional" + String.fromCodePoint(code) + ".png";
      expect(hasControlCharacters(value)).toBe(true);
      expect(() => validateMediaFile(value, "image/png", 1)).toThrow();
    }
    expect(hasControlCharacters("Fictional résumé 👋.png")).toBe(false);
    expect(() =>
      validateMediaFile("Fictional résumé 👋.png", "image/png", 1),
    ).not.toThrow();
  });
});
