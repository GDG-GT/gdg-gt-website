import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

// Inventory evidence without executing mutations or promoting PRD acceptance.
// This deliberately distinguishes recorded historical service runs from the
// fresh complete source run and current native browser workflow exercises.
const write = process.argv.length === 3 && process.argv[2] === "--write";
if (process.argv.length > 2 && !write) throw Error("Optional argument: --write");
const read = async (file) => JSON.parse(await readFile(file, "utf8")),
  plan = await read(".docs/phase0/prd-test-plan.json"),
  sourcePath = "artifacts/quality/native-verified-source-tests.json",
  source = await read(sourcePath),
  coverage = (await read("coverage/native-verified-20261107/coverage-summary.json")).total,
  databasePath = ".docs/phase0/canonical-tests.json", database = await read(databasePath),
  legacyPath = ".docs/phase0/canonical-tests-legacy-grants.json", legacy = await read(legacyPath),
  executedUnits = new Set(source.testResults.map((row) => path.relative(process.cwd(), row.name))),
  executedSql = new Set(database.tests.filter((row) => row.passed).map((row) => row.name)),
  sha256 = (value) => createHash("sha256").update(value).digest("hex");
if (!source.success || source.numFailedTests || source.numPassedTests !== source.numTotalTests || source.testResults.some((r) => r.assertionResults.some((t) => t.status !== "passed"))) throw Error("Complete current source execution must pass before evidence audit.");
if (database.migrations.length !== 140 || legacy.migrations.length !== 140 || !database.tests.every((t) => t.passed) || !legacy.tests.every((t) => t.passed)) throw Error("Both complete 140-migration suites must pass.");
const nonVisual = plan.cases.filter((row) => !row.id.startsWith("VIS-")),
  nativePaths = [...new Set(nonVisual.flatMap((row) => row.automated).filter((file) => file.startsWith("scripts/test-local-")))].sort(),
  native = [], missing = [];
for (const file of nativePaths) {
  const text = await readFile(file, "utf8"),
    reportPaths = [...new Set([...text.matchAll(/\.docs\/phase0\/([a-zA-Z0-9_-]+\.json)/g)].map((m) => ".docs/phase0/" + m[1]))];
  // Profile filenames are intentionally constructed from validated arguments.
  if (file.endsWith("test-local-functional-flows.mjs"))
    reportPaths.push(".docs/phase0/local-functional-flows.json");
  const reports = [];
  for (const reportPath of reportPaths) {
    let report;
    try { report = await read(reportPath); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
    const tests = report.tests || report.checks;
    if (!Array.isArray(tests) || !tests.length || report.completed === false || report.passed === false || tests.some((t) => t.passed !== true)) continue;
    reports.push({ file: reportPath, checks: tests.length, generatedAt: report.generatedAt || null,
      source: "Recorded real-local-service evidence; historical timestamps remain explicit. Not a claim that every service suite ran again on this source revision." });
  }
  if (!reports.length) missing.push(file);
  native.push({ script: file, sourceSha256: sha256(text), recordedPassingEvidence: reports });
}
const missingUnits = [], missingSql = [];
for (const row of nonVisual) for (const file of row.automated) {
  if (/\.test\.[cm]?[jt]sx?$/.test(file) && !executedUnits.has(file)) missingUnits.push({ case: row.id, file });
  if (file.startsWith("database/tests/") && !executedSql.has(path.basename(file))) missingSql.push({ case: row.id, file });
}
const manualOnly = nonVisual.filter((row) => !row.automated.length).map(({ id, scope, remaining }) => ({ id, scope, remaining })),
  byDomain = {};
for (const row of nonVisual) {
  const domain = row.id.split("-TEST-")[0], group = byDomain[domain] ||= { logicalCases: 0, casesWithAutomatedSources: 0, nativeScripts: new Set(), unitFiles: new Set(), sqlFiles: new Set() };
  group.logicalCases++;
  if (row.automated.length) group.casesWithAutomatedSources++;
  for (const file of row.automated) {
    if (file.startsWith("scripts/test-local-")) group.nativeScripts.add(file);
    if (/\.test\.[cm]?[jt]sx?$/.test(file)) group.unitFiles.add(file);
    if (file.startsWith("database/tests/")) group.sqlFiles.add(file);
  }
}
for (const group of Object.values(byDomain)) for (const key of ["nativeScripts", "unitFiles", "sqlFiles"]) group[key] = [...group[key]].sort();
const result = {
  generatedAt: new Date().toISOString(),
  completedEvidenceInventory: !missing.length && !missingUnits.length && !missingSql.length,
  scope: "Non-visual PRD evidence inventory. Confirms referenced native scripts have passing recorded reports, unit references belong to the current complete passing source execution, and SQL references belong to the recorded passing canonical database execution. Source mapping/report existence alone is not exhaustive functional proof or full PRD acceptance. Historical runs are not relabeled as freshly executed.",
  prdLogicalCases: plan.cases.length, nonVisualLogicalCases: nonVisual.length,
  currentSource: { report: sourcePath, passed: source.numPassedTests, failed: source.numFailedTests, files: source.testResults.length,
    reportSha256: sha256(await readFile(sourcePath)), coverage: Object.fromEntries(["lines", "statements", "functions", "branches"].map((k) => [k, coverage[k].pct])) },
  databases: { normal: databasePath, legacyGrants: legacyPath, migrations: 140, sqlChecks: database.tests.length, unchangedDataAndCapacityAssertions: true },
  native, byDomain, missingNativeEvidence: missing, missingUnitExecution: missingUnits, missingSqlExecution: missingSql, manualOnly,
  fullPrdAcceptance: false,
};
if (write) await writeFile(".docs/phase0/local-functional-evidence-inventory.json", JSON.stringify(result, null, 2) + "\n");
console.info(JSON.stringify({ completedEvidenceInventory: result.completedEvidenceInventory, currentSourceTests: result.currentSource.passed, nativeScripts: native.length, nativeReportChecks: native.flatMap((n) => n.recordedPassingEvidence).reduce((n, r) => n + r.checks, 0), missingNativeEvidence: missing, missingUnitExecution: missingUnits, missingSqlExecution: missingSql, manualOnlyCases: manualOnly.map((r) => r.id) }, null, 2));
if (!result.completedEvidenceInventory) process.exitCode = 1;
