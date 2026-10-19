import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("user-approved no-white palette", () => {
  it("defines distinct pale-yellow surfaces without pure-white declarations", () => {
    const styles = readFileSync(
      new URL("../styles/gt.css", import.meta.url),
      "utf8",
    );
    expect(styles).not.toMatch(/:\s*(?:white|#fff(?:fff)?)\s*[;}]/i);
    for (const role of [
      "canvas",
      "workspace",
      "surface",
      "surface-raised",
      "text-on-dark",
    ])
      expect(styles).toContain(`--${role}:`);
    expect(styles).toContain('input[type="checkbox"]');
  });
});
