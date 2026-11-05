import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  report = JSON.parse(
    await readFile(
      new URL("../artifacts/browser/results.json", import.meta.url),
      "utf8",
    ),
  ),
  version = JSON.parse(
    await readFile(require.resolve("@playwright/test/package.json"), "utf8"),
  ).version,
  tests = [];
const args = process.argv.slice(2),
  file = args.length ? args[1] : "browser-smoke.json";
if (
  args.length &&
  (args.length !== 2 ||
    args[0] !== "--file" ||
    !/^[a-z0-9][a-z0-9-]{0,63}\.json$/.test(file))
)
  throw Error("Use --file with a simple evidence JSON basename.");
function visit(suites) {
  for (const suite of suites) {
    for (const spec of suite.specs || [])
      for (const test of spec.tests)
        tests.push({
          name: spec.title,
          project: test.projectName,
          expected: test.expectedStatus,
          results: test.results.map((result) => result.status),
        });
    visit(suite.suites || []);
  }
}
visit(report.suites || []);
const completed =
  report.stats.unexpected === 0 &&
  report.stats.flaky === 0 &&
  !(report.errors || []).length;
const summary =
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      completed,
      playwrightVersion: version,
      platform: process.platform,
      arch: process.arch,
      stats: report.stats,
      note: "Production-build browser checks with explicit local API fixtures, no database/credentials/provider sends. Screenshots are unapproved review candidates, not initial golden baselines or approved pixel comparisons. WebKit/mobile emulation does not certify Safari or real devices. Local execution does not certify the new CI job has run.",
      tests,
    },
    null,
    2,
  ) + "\n";
await writeFile(new URL("../.docs/phase0/" + file, import.meta.url), summary);
await writeFile(
  new URL(
    "../artifacts/browser/" + (args.length ? file : "summary.json"),
    import.meta.url,
  ),
  summary,
);
console.log(
  "Browser evidence: " +
    report.stats.expected +
    " passed, " +
    report.stats.skipped +
    " expected skips, " +
    report.stats.unexpected +
    " failures.",
);
if (!completed) process.exitCode = 1;
