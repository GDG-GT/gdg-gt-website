import { readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
const args = process.argv.slice(2);
if (args.length && (args.length !== 1 || args[0] !== "--secondary"))
  throw Error("Optional review scope: --secondary");
const secondary = args.length === 1;
const root = path.resolve("."),
  output = path.resolve(
    secondary
      ? "artifacts/browser/secondary-review"
      : "artifacts/browser/visual-review",
  ),
  report = JSON.parse(
    await readFile(path.join(output, "results.json"), "utf8"),
  );
const primaryPrompts = [
  ["Homepage", ["public /"]],
  ["Hero and shared navigation", ["hero"]],
  ["Chapter statistics", ["statistics"]],
  ["Upcoming events", ["upcoming-events"]],
  ["Footer", ["footer"]],
  ["Events listing", ["public /events"]],
  ["Event detail", ["public /events/fictional-event-1"]],
  ["Public team", ["public /team"]],
  ["Resources", ["public /resources"]],
  ["Sponsors", ["public /sponsors"]],
  ["Gallery", ["public /gallery"]],
  ["Contact", ["public /contact"]],
  ["Admin overview", ["overview"]],
  ["Admin events", ["events"]],
  ["Teams and collaboration", ["teams", "team workspace"]],
  ["Finances", ["finance requests", "finance detail", "finance budgets"]],
  ["Communications and newsletter", ["newsletter campaigns"]],
  ["Content and media", ["media library"]],
  ["Forms library", ["forms library"]],
  ["Form builder", ["forms builder"]],
  ["Public form", ["public form"]],
  ["Form responses", ["forms responses"]],
];
const prompts = secondary
  ? [
      [
        "VIS-TEST-015",
        "Teams and collaboration",
        ["team announcements", "team conversation", "channel conversation"],
      ],
      ["VIS-TEST-017", "Communications and newsletter", ["campaign preview"]],
      ["VIS-TEST-018", "Content and media", ["media inspector"]],
      [
        "VIS-TEST-020",
        "Form builder",
        [
          "builder logic",
          "builder settings",
          "builder logic lower controls",
          "builder settings lower controls",
        ],
      ],
      [
        "VIS-TEST-022",
        "Form responses",
        [
          "response analytics",
          "individual response",
          "individual response lower controls",
        ],
      ],
    ]
  : primaryPrompts.map(([title, names], i) => [
      "VIS-TEST-" + String(i + 1).padStart(3, "0"),
      title,
      names,
    ]);
const captures = [];
let compositionChecks = 0;
async function visit(suites) {
  for (const suite of suites) {
    for (const spec of suite.specs || []) {
      if (
        !(
          secondary
            ? /^secondary-compositions\.spec\.ts$/
            : /^(?:operations|public|workspace)-compositions\.spec\.ts$/
        ).test(path.basename(spec.file || suite.file || ""))
      )
        continue;
      for (const test of spec.tests || []) {
        if (test.results.length !== 1 || test.results[0].status !== "passed")
          throw Error(
            "Visual inventory requires one passing attempt per case.",
          );
        compositionChecks++;
        for (const a of test.results[0].attachments || []) {
          if (a.contentType !== "image/png") continue;
          const file = path.resolve(a.path);
          if (
            !file.startsWith(output + path.sep) ||
            path.extname(file) !== ".png"
          )
            throw Error(
              "Visual capture must remain in the owned review directory.",
            );
          await access(file);
          captures.push({
            name: a.name,
            project: test.projectName,
            test: spec.title,
            file: path.relative(root, file),
          });
        }
      }
    }
    await visit(suite.suites || []);
  }
}
if (
  report.stats.unexpected ||
  report.stats.flaky ||
  (report.errors || []).length
)
  throw Error(
    "Failed or incomplete visual invocation cannot become review evidence.",
  );
await visit(report.suites || []);
const required = [
  "chromium-1920",
  "chromium-1440",
  "chromium-mobile",
  "firefox-1440",
  "webkit-1440",
  "webkit-mobile",
];
const rows = prompts.map(([id, title, names]) => {
  const matches = captures.filter((c) => names.includes(c.name));
  for (const name of names)
    for (const project of required)
      if (
        matches.filter((c) => c.name === name && c.project === project)
          .length !== 1
      )
        throw Error(
          "Missing or duplicate prompt capture: " + name + " / " + project,
        );
  return {
    id,
    title,
    acceptance: "unverified",
    captures: matches,
  };
});
const mappedNames = new Set(prompts.flatMap(([, , names]) => names));
const supplementalCaptures = captures.filter(
  (capture) => !mappedNames.has(capture.name),
);
if (secondary && supplementalCaptures.length)
  throw Error("Unexpected secondary review capture names.");
if (secondary && (compositionChecks !== 54 || captures.length !== 72))
  throw Error(
    "The secondary review requires all nine named states across all six profiles.",
  );
const note =
  "Fictional fixtures and illustrative assets only. These are review candidates, not approved content, golden baselines, 1% visual comparisons or full prompt fidelity acceptance. Six emulated browser/viewport profiles do not certify physical devices, Safari or assistive technology. " +
  (secondary
    ? "These nine secondary states supplement the primary review; remaining secondary and confirmation states still need their own applicable acceptance review."
    : "Primary compositions are captured; every secondary drawer, editor inspector, chart, collaboration surface and confirmation state still requires its own applicable acceptance review.");
const summary = {
  generatedAt: new Date().toISOString(),
  completed: true,
  scope: secondary ? "secondary" : "primary",
  note,
  stats: report.stats,
  projects: required,
  compositionChecks,
  captureCount: captures.length,
  prompts: rows,
  supplementalCaptures,
};
await writeFile(
  secondary
    ? ".docs/phase0/secondary-visual-review.json"
    : ".docs/phase0/populated-visual-review.json",
  JSON.stringify(summary, null, 2) + "\n",
);
const esc = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const link = (file) =>
  path
    .relative(output, path.resolve(root, file))
    .split(path.sep)
    .map(encodeURIComponent)
    .join("/");
const reviewRows = supplementalCaptures.length
  ? [
      ...rows,
      {
        id: "Supplemental",
        title: "Private projects and Linktree",
        captures: supplementalCaptures,
      },
    ]
  : rows;
await writeFile(
  path.join(output, "index.html"),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GDG GT visual review candidates</title><style>body{font:16px/1.5 system-ui;color:#2d2d2d;background:#f2f3f4;margin:0;padding:32px;max-width:1500px}h1{font-size:32px}p{max-width:85ch}section{border-top:1px solid #c3c8ca;padding:24px 0}ul{display:flex;flex-wrap:wrap;gap:16px;list-style:none;padding:0}li{width:min(100%,340px)}a{color:#a93527}img{width:100%;height:220px;object-fit:contain;object-position:top;background:#e4e6e7}small{display:block}</style><h1>GDG GT: ${secondary ? "secondary state" : "22 prompt"} review candidates</h1><p>${esc(note)}</p><p>${compositionChecks} composition checks passed (${report.stats.expected} passing checks in the source invocation). No approval has been recorded.</p>${reviewRows.map((r) => `<section><h2>${esc(r.id)} · ${esc(r.title)}</h2><ul>${r.captures.map((c) => `<li><a href="${esc(link(c.file))}"><img loading="lazy" alt="${esc(c.name + " in " + c.project)}" src="${esc(link(c.file))}">${esc(c.name)}<small>${esc(c.project)} · open full capture</small></a></li>`).join("")}</ul></section>`).join("")}</html>`,
);
console.log(
  `${rows.length} prompt groups, ${captures.length} unapproved captures; ${compositionChecks} passing composition checks.`,
);
