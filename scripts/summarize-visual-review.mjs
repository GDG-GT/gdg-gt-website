import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import path from "node:path";
const args = process.argv.slice(2);
if (
  args.length &&
  (args.length !== 1 ||
    !["--secondary", "--current-primary", "--final-primary"].includes(args[0]))
)
  throw Error(
    "Optional review scope: --secondary, --current-primary or --final-primary",
  );
const finalPrimary = args[0] === "--final-primary";
const secondary = args[0] === "--secondary",
  currentPrimary = args[0] === "--current-primary" || finalPrimary;
const root = path.resolve("."),
  output = path.resolve(
    currentPrimary
      ? "artifacts/browser/current-primary-review"
      : secondary
        ? "artifacts/browser/secondary-review"
        : "artifacts/browser/visual-review",
  ),
  // The last full primary invocation is preserved before the secondary-only
  // expansion; never infer primary captures from a secondary-only run.
  captureRoot = finalPrimary
    ? path.resolve("artifacts/browser/final-current-inventory")
    : currentPrimary
      ? path.resolve(
          "artifacts/browser/secondary-review-before-collaboration-20261107",
        )
      : output,
  report = JSON.parse(
    await readFile(path.join(captureRoot, "results.json"), "utf8"),
  );
if (
  finalPrimary &&
  (report.stats.expected !== 1540 || report.stats.skipped !== 8)
)
  throw Error(
    "Final primary review requires the complete 1,548-case invocation with eight expected skips.",
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
      ["VIS-TEST-013", "Overview chart data", ["registration data table"]],
      [
        "VIS-TEST-014",
        "Events and attendance",
        [
          "event editor",
          "event attendees",
          "attendee correction",
          "attendee removal review",
          "attendee removal review lower controls",
          "event email draft",
          "event email history",
          "event email approval review",
          "event archive review",
          "event archive review lower controls",
          "event cancellation review",
          "event cancellation review lower controls",
          "event unpublish review",
          "event unpublish review lower controls",
          "event duplication review",
          "event duplication review lower controls",
        ],
      ],
      [
        "VIS-TEST-015",
        "Teams and collaboration",
        [
          "team announcements",
          "team conversation",
          "channel conversation",
          "whiteboard canvas",
          "whiteboard collaborators",
        ],
      ],
      [
        "VIS-TEST-017",
        "Communications and newsletter",
        [
          "campaign preview",
          "task inventory",
          "task discussion",
          "task editor",
          "private conversation",
          "private message compose",
          "private review request",
          "campaign custom audience",
          "campaign send entry",
          "campaign send approval",
          "campaign delivery results",
        ],
      ],
      [
        "VIS-TEST-018",
        "Content and media",
        [
          "media inspector",
          "private upload selection",
          "private upload validation",
          "image publication review",
          "image revocation review",
        ],
      ],
      [
        "VIS-TEST-020",
        "Form builder",
        [
          "builder logic",
          "builder settings",
          "builder logic lower controls",
          "builder settings lower controls",
          "builder access",
          "builder access lower controls",
          "published version comparison",
          "published version comparison lower controls",
          "form publication review",
          "form publication review lower controls",
        ],
      ],
      [
        "VIS-TEST-022",
        "Form responses",
        [
          "response analytics",
          "individual response",
          "individual response lower controls",
          "response revision review",
          "response revision review lower controls",
          "response retention review",
          "response retention review lower controls",
          "response export review",
          "response sensitive reveal",
          "response sensitive reveal lower controls",
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
            ? /^(?:(?:secondary|event|task-message|publication-campaign|form-review)-compositions|whiteboard-composition)\.spec\.ts$/
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
          const recordedFile = path.resolve(a.path),
            originalCaptureRoot = path.resolve(
              "artifacts/browser/secondary-review",
            ),
            file =
              currentPrimary &&
              !finalPrimary &&
              recordedFile.startsWith(originalCaptureRoot + path.sep)
                ? path.resolve(
                    captureRoot,
                    path.relative(originalCaptureRoot, recordedFile),
                  )
                : recordedFile;
          if (
            !file.startsWith(captureRoot + path.sep) ||
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
    for (const project of required) {
      // Access is inline on desktop and a scrolling dialog on mobile. Require
      // lower-control captures only where that modal actually exists, and
      // reject any unexpected desktop counterpart rather than inventing one.
      const expected =
        secondary &&
        name === "builder access lower controls" &&
        !project.endsWith("-mobile")
          ? 0
          : 1;
      if (
        matches.filter((c) => c.name === name && c.project === project)
          .length !== expected
      )
        throw Error(
          "Missing or duplicate prompt capture: " + name + " / " + project,
        );
    }
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
if (secondary && (compositionChecks !== 264 || captures.length !== 344))
  throw Error(
    "The secondary review requires all forty-four named states across all six profiles.",
  );
if (!secondary && (compositionChecks !== 138 || captures.length !== 162))
  throw Error(
    "The primary review requires 138 composition checks and 162 named captures across all six profiles.",
  );
const note =
  "Fictional fixtures and illustrative assets only. These are review candidates, not approved content, golden baselines, 1% visual comparisons or full prompt fidelity acceptance. Six emulated browser/viewport profiles do not certify physical devices, Safari or assistive technology. " +
  (secondary
    ? "These forty-four secondary states supplement the primary review; remaining secondary and confirmation states still need their own applicable acceptance review."
    : "Primary compositions are captured; every secondary drawer, editor inspector, chart, collaboration surface and confirmation state still requires its own applicable acceptance review.");
const summary = {
  generatedAt: new Date().toISOString(),
  completed: true,
  scope: secondary ? "secondary" : "primary",
  sourceCaptureDirectory: path.relative(root, captureRoot),
  ...(currentPrimary && !finalPrimary
    ? {
        captureRelocation:
          "Original attachment paths resolved relative to the preserved invocation directory; image bytes and original report retained unchanged.",
      }
    : {}),
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
await mkdir(output, { recursive: true });
await writeFile(
  path.join(output, "index.html"),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GDG GT visual review candidates</title><style>body{font:16px/1.5 system-ui;color:#2d2d2d;background:#f2f3f4;margin:0;padding:32px;max-width:1500px}h1{font-size:32px}p{max-width:85ch}section{border-top:1px solid #c3c8ca;padding:24px 0}ul{display:flex;flex-wrap:wrap;gap:16px;list-style:none;padding:0}li{width:min(100%,340px)}a{color:#a93527}img{width:100%;height:220px;object-fit:contain;object-position:top;background:#e4e6e7}small{display:block}</style><h1>GDG GT: ${secondary ? "secondary state" : "22 prompt"} review candidates</h1><p>${esc(note)}</p><p>${compositionChecks} composition checks passed (${report.stats.expected} passing checks in the source invocation). No approval has been recorded.</p>${reviewRows.map((r) => `<section><h2>${esc(r.id)} · ${esc(r.title)}</h2><ul>${r.captures.map((c) => `<li><a href="${esc(link(c.file))}"><img loading="lazy" alt="${esc(c.name + " in " + c.project)}" src="${esc(link(c.file))}">${esc(c.name)}<small>${esc(c.project)} · open full capture</small></a></li>`).join("")}</ul></section>`).join("")}</html>`,
);
console.log(
  `${rows.length} prompt groups, ${captures.length} unapproved captures; ${compositionChecks} passing composition checks.`,
);
