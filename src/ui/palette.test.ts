import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("neutral no-pure-white palette", () => {
  it("defines low-tint surfaces without pure-white declarations or a yellow cast", () => {
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
    expect(styles).toContain('--canvas: oklch(98% 0.002 250)');
    expect(styles).toContain('--workspace: oklch(96% 0.003 250)');
    expect(styles).toContain('--surface: oklch(99% 0.001 250)');
    expect(styles).not.toMatch(/#(?:fff1cc|fff2c7|fff4d0|fff5d6|e8d8ab|eddfb5)/i);
  });
});
