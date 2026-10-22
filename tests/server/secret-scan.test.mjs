import { describe, it, expect } from "vitest";
import {
  sha256,
  safeScanPath,
  reviewSecretFindings,
  secretScanArchives,
} from "../../scripts/lib/secret-scan.mjs";
const source = 'const fixture = "fictional test only";',
  finding = {
    File: "tests/fixture.mjs",
    StartLine: 1,
    EndLine: 1,
    RuleID: "generic-api-key",
    Commit: "a".repeat(40),
    Secret: "must-not-be-serialized",
    Match: "private text",
  };
const review = {
  file: finding.File,
  rule: finding.RuleID,
  lineSha256: sha256(source),
  reason: "Exact fictional fixture reviewed.",
};
describe("SEC fail-closed source scan review policy", () => {
  it("accepts safe relative paths, never traversal, absolute paths or alternate separators", () => {
    expect(safeScanPath("src/components/My File.tsx")).toBe(true);
    for (const value of [
      "",
      null,
      "../secret",
      "src/../../secret",
      "/private/secret",
      "C:/secret",
      "src\\secret",
      "src/./file",
      "src//file",
      "nul\0file",
    ])
      expect(safeScanPath(value)).toBeFalsy();
  });
  it("reviews only an exact rule/file/source range hash and never serializes secret material", async () => {
    const results = await reviewSecretFindings(
      [finding],
      [review],
      async () => source,
      "history",
    );
    expect(results[0].reviewedNonSecret).toBe(true);
    expect(JSON.stringify(results)).not.toContain("must-not-be-serialized");
    expect(JSON.stringify(results)).not.toContain("private text");
    for (const changed of [
      { ...finding, File: "other.mjs" },
      { ...finding, RuleID: "different-rule" },
    ])
      expect(
        (
          await reviewSecretFindings(
            [changed],
            [review],
            async () => source,
            "history",
          )
        )[0].reviewedNonSecret,
      ).toBe(false);
    expect(
      (
        await reviewSecretFindings(
          [finding],
          [review],
          async () => source + "changed",
          "worktree",
        )
      )[0].reviewedNonSecret,
    ).toBe(false);
  });
  it("fails instead of accepting unknown locations, incomplete source, malformed commit or report", async () => {
    for (const changed of [
      { ...finding, File: "../private" },
      { ...finding, StartLine: 0 },
      { ...finding, EndLine: 2 },
      { ...finding, Commit: "HEAD:secret" },
    ])
      await expect(
        reviewSecretFindings(
          [changed],
          [review],
          async () => source,
          "history",
        ),
      ).rejects.toThrow();
    await expect(
      reviewSecretFindings({}, [], async () => source, "history"),
    ).rejects.toThrow();
    await expect(
      reviewSecretFindings([], [], async () => source, "unknown"),
    ).rejects.toThrow();
  });
  it("pins every supported official archive by a complete SHA-256 digest", () => {
    expect(Object.keys(secretScanArchives)).toEqual([
      "darwin_arm64",
      "darwin_x64",
      "linux_arm64",
      "linux_x64",
    ]);
    for (const value of Object.values(secretScanArchives))
      expect(value).toMatch(/^[a-f0-9]{64}$/);
  });
});
