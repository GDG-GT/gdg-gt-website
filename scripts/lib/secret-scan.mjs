import { createHash } from "node:crypto";
import path from "node:path";

export const secretScanVersion = "8.30.1";
// Official GitHub release asset IDs for the exact checksum-pinned archives.
export const secretScanAssetIds = {
  darwin_arm64: 378332059,
  darwin_x64: 378332053,
  linux_arm64: 378332057,
  linux_x64: 378332058,
};
// Official release SHA-256 values, verified against both its checksum asset and
// GitHub release metadata. A version bump requires reviewing these pins too.
export const secretScanArchives = {
  darwin_arm64:
    "b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5",
  darwin_x64:
    "dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709",
  linux_arm64:
    "e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080",
  linux_x64: "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb",
};
export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
export function safeScanPath(value) {
  return (
    typeof value === "string" &&
    !!value &&
    !value.includes("\0") &&
    !path.isAbsolute(value) &&
    !/^[A-Za-z]:/.test(value) &&
    !value.includes("\\") &&
    value.split("/").every((part) => part !== ".." && part !== "." && !!part)
  );
}
export async function reviewSecretFindings(
  findings,
  reviews,
  loadSource,
  scope,
) {
  if (!Array.isArray(findings) || !["history", "worktree"].includes(scope))
    throw Error("Invalid scanner report.");
  const results = [];
  for (const finding of findings) {
    if (
      !safeScanPath(finding.File) ||
      !Number.isInteger(finding.StartLine) ||
      !Number.isInteger(finding.EndLine) ||
      finding.StartLine < 1 ||
      finding.EndLine < finding.StartLine ||
      typeof finding.RuleID !== "string" ||
      (scope === "history" && !/^[a-f0-9]{40,64}$/.test(finding.Commit || ""))
    )
      throw Error("Invalid scanner location.");
    const source = await loadSource(finding),
      lines = source.split("\n");
    if (finding.EndLine > lines.length)
      throw Error("Scanner source range unavailable.");
    const hash = sha256(
      lines.slice(finding.StartLine - 1, finding.EndLine).join("\n"),
    );
    const review = reviews.find(
      (review) =>
        review.rule === finding.RuleID &&
        review.file === finding.File &&
        review.lineSha256 === hash &&
        typeof review.reason === "string" &&
        review.reason.trim(),
    );
    // Never serialize Match, Secret, author/email or arbitrary scanner metadata.
    results.push({
      scope,
      rule: finding.RuleID,
      file: finding.File,
      line: finding.StartLine,
      ...(scope === "history" ? { commit: finding.Commit } : {}),
      reviewedNonSecret: !!review,
      ...(review ? { reason: review.reason } : {}),
    });
  }
  return results;
}
