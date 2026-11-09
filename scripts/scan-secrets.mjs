import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  readFile,
  writeFile,
  mkdtemp,
  mkdir,
  lstat,
  copyFile,
  chmod,
  rm,
} from "node:fs/promises";
import { tmpdir, platform, arch } from "node:os";
import path from "node:path";
import { downloadPinnedArtifact } from "./lib/pinned-download.mjs";
import { fileURLToPath } from "node:url";
import {
  secretScanVersion,
  secretScanArchives,
  secretScanAssetIds,
  sha256,
  safeScanPath,
  reviewSecretFindings,
} from "./lib/secret-scan.mjs";
const execute = promisify(execFile),
  root = fileURLToPath(new URL("../", import.meta.url));
const archiveKey = platform() + "_" + arch(),
  expected = secretScanArchives[archiveKey];
if (!expected)
  throw Error(
    "Secret scanning supports pinned macOS/Linux arm64/x64 archives.",
  );
const scratch = await mkdtemp(path.join(tmpdir(), "gdg-secret-scan-"));
await chmod(scratch, 0o700);
let report;
try {
  const asset = `gitleaks_${secretScanVersion}_${archiveKey}.tar.gz`;
  const archive = await downloadPinnedArtifact({
    urls: [
      `https://github.com/gitleaks/gitleaks/releases/download/v${secretScanVersion}/${asset}`,
      `https://api.github.com/repos/gitleaks/gitleaks/releases/assets/${secretScanAssetIds[archiveKey]}`,
    ],
    sha256: expected,
    maxBytes: 30 * 1024 * 1024,
    timeoutMs: 60000,
    headers: { Accept: "application/octet-stream" },
  });
  const archivePath = path.join(scratch, "scanner.tar.gz");
  await writeFile(archivePath, archive, { mode: 0o600 });
  await execute("tar", ["-xzf", archivePath, "-C", scratch, "gitleaks"]);
  const binary = path.join(scratch, "gitleaks");
  const { stdout: version } = await execute(binary, ["version"]);
  if (version.trim() !== secretScanVersion)
    throw Error("Scanner version mismatch.");
  const config = path.join(scratch, "scanner.toml");
  await writeFile(
    config,
    'title = "GDG source/history scan"\n[extend]\nuseDefault = true\n',
    { mode: 0o600 },
  );
  const childEnv = { ...process.env };
  delete childEnv.GITLEAKS_CONFIG;
  delete childEnv.GITLEAKS_CONFIG_TOML;
  const snapshot = path.join(scratch, "worktree");
  await mkdir(snapshot);
  const { stdout: listing } = await execute(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, maxBuffer: 8 * 1024 * 1024 },
  );
  const files = [...new Set(listing.split("\0").filter(Boolean))],
    symlinks = [];
  let copied = 0;
  for (const file of files) {
    if (!safeScanPath(file))
      throw Error("Unsafe source path in Git inventory.");
    let info;
    try {
      info = await lstat(path.join(root, file));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (info.isSymbolicLink()) {
      symlinks.push(file);
      continue;
    }
    if (!info.isFile()) throw Error("Unsupported source inventory entry.");
    const target = path.join(snapshot, file);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(root, file), target);
    copied++;
  }
  const reviewDocument = JSON.parse(
    await readFile(path.join(root, ".docs/secret-scan-reviews.json"), "utf8"),
  );
  if (reviewDocument.version !== 1 || !Array.isArray(reviewDocument.reviews))
    throw Error("Invalid exact-line review inventory.");
  const scans = [];
  for (const scope of ["history", "worktree"]) {
    const output = path.join(scratch, scope + ".json");
    const args = [
      scope === "history" ? "git" : "dir",
      "--config",
      config,
      "--gitleaks-ignore-path",
      scratch,
      "--no-banner",
      "--no-color",
      "--redact=100",
      "--ignore-gitleaks-allow",
      "--max-decode-depth=5",
      "--max-archive-depth=0",
      "--log-level=warn",
      "--report-format=json",
      "--report-path",
      output,
      "--timeout=120",
      ...(scope === "history"
        ? ["--log-opts=--all --full-history", root]
        : [snapshot]),
    ];
    try {
      await execute(binary, args, {
        cwd: root,
        env: childEnv,
        maxBuffer: 1024 * 1024,
        timeout: 150000,
      });
    } catch (error) {
      if (error.code !== 1)
        throw Error("Secret scanner failed; no passing scan is claimed.");
    }
    const raw = JSON.parse(await readFile(output, "utf8"));
    if (!Array.isArray(raw)) throw Error("Invalid scanner report.");
    if (scope === "worktree")
      for (const finding of raw) {
        const relative = path.isAbsolute(finding.File)
          ? path.relative(snapshot, finding.File)
          : finding.File;
        finding.File = relative;
      }
    const results = await reviewSecretFindings(
      raw,
      reviewDocument.reviews,
      async (finding) => {
        if (scope === "worktree")
          return readFile(path.join(snapshot, finding.File), "utf8");
        const result = await execute(
          "git",
          ["show", finding.Commit + ":" + finding.File],
          { cwd: root, maxBuffer: 8 * 1024 * 1024 },
        );
        return result.stdout;
      },
      scope,
    );
    scans.push({ scope, findings: results });
  }
  const { stdout: commitCount } = await execute(
    "git",
    ["rev-list", "--all", "--count"],
    { cwd: root },
  );
  const unreviewed = scans
    .flatMap((scan) => scan.findings)
    .filter((finding) => !finding.reviewedNonSecret).length;
  report = {
    tool: "gitleaks",
    version: secretScanVersion,
    archiveSha256: expected,
    head: (
      await execute("git", ["rev-parse", "HEAD"], { cwd: root })
    ).stdout.trim(),
    commits: Number(commitCount.trim()),
    currentFiles: copied,
    symlinkTargetsNotFollowed: symlinks,
    scans,
    unreviewed,
    note: "Read-only all-local-ref history plus current tracked/nonignored untracked file snapshot. Default rules, decoded text depth 5, no baseline/rule/path exclusions or inline suppression. Ignored local credentials/dependencies/caches, archive contents and image OCR are outside the source scan. Findings are redacted; only exact reviewed source-line hashes may pass as non-secrets. Not proof that no secret could exist.",
  };
  await writeFile(
    path.join(root, ".docs/phase0/secret-scan.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.info(
    `Secret scan: ${report.commits} commits, ${report.currentFiles} current files, ${unreviewed} unreviewed findings.`,
  );
  if (unreviewed) process.exitCode = 1;
} finally {
  // Only this invocation's minted scratch directory. Never follow source
  // symlinks or recursively clean a repository, user cache or home directory.
  if (
    path.dirname(scratch) !== tmpdir() ||
    !path.basename(scratch).startsWith("gdg-secret-scan-")
  )
    throw Error("Unsafe scratch cleanup target.");
  await rm(scratch, { recursive: true, force: true });
}
