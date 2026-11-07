import {
  readFile,
  readdir,
  writeFile,
  mkdir,
  realpath,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

// Index existing functional-test captures only after the entire saved-build
// invocation passes. This does not execute tests or manufacture new screenshots.
const root = path.resolve("artifacts/browser/final-current-inventory");
const report = JSON.parse(
  await readFile(path.join(root, "results.json"), "utf8"),
);
const projects = [
  "chromium-1920",
  "chromium-1440",
  "chromium-mobile",
  "firefox-1440",
  "webkit-1440",
  "webkit-mobile",
];
if (
  report.stats.expected !== 1540 ||
  report.stats.skipped !== 8 ||
  report.stats.unexpected ||
  report.stats.flaky ||
  report.errors?.length
)
  throw Error(
    "Recovery review requires the complete 1,548-case saved-build invocation: 1,540 passes and eight expected skips, no failures or retries.",
  );

const states = [
  ["Account recovery", "account-review", "account-recovery-review"],
  ["Announcement recovery", "announcement-review", "announcement-recovered"],
  ["Invitation recovery", "invitation-review", "invitation-recovered"],
  ["Team reconciliation", "team-review", "team-reconciled"],
  ["Team grant review", "team-review", "team-grants-review"],
  ["Member create recovery", "member-write-recovery", "member-original-create"],
  ["Member update recovery", "member-write-recovery", "member-original-update"],
  [
    "Member archive recovery",
    "member-write-recovery",
    "member-original-archive",
  ],
  ["Complete merge picker", "member-merge-reads", "complete-merge-picker"],
  [
    "Retained merge comparison",
    "member-merge-reads",
    "retained-merge-comparison",
  ],
  ["Merge preview recovery", "member-merge-writes", "unknown-merge-preview"],
  ["Merge commit recovery", "member-merge-writes", "unknown-merge-commit"],
  [
    "Inquiry status recovery",
    "contact-write-recovery",
    "inquiry-original-status",
  ],
  ["Inquiry hold recovery", "contact-write-recovery", "inquiry-original-hold"],
  ["Retained privacy scope", "privacy-read-recovery", "retained-privacy-scope"],
  [
    "Retained privacy review",
    "privacy-read-recovery",
    "retained-privacy-review",
  ],
  [
    "Privacy review recovery",
    "privacy-write-recovery",
    "unknown-privacy-review",
  ],
  [
    "Privacy commit recovery",
    "privacy-write-recovery",
    "unknown-privacy-commit",
  ],
];
const entries = await readdir(root, { withFileTypes: true });
const captures = [];
for (const [name, source, file] of states) {
  for (const project of projects) {
    const candidates = entries.filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name.startsWith(source + "-") &&
        entry.name.endsWith("-" + project),
    );
    const matches = [];
    for (const entry of candidates) {
      const files = await readdir(path.join(root, entry.name));
      if (files.includes(file + ".png"))
        matches.push(path.join(root, entry.name, file + ".png"));
    }
    if (matches.length !== 1)
      throw Error(
        `Missing or duplicate recovery capture: ${file} / ${project}`,
      );
    const resolved = await realpath(matches[0]);
    if (!resolved.startsWith(root + path.sep))
      throw Error("Recovery capture escaped its owned directory.");
    const bytes = await readFile(resolved);
    if (
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      throw Error("Recovery capture is not a PNG.");
    captures.push({
      name,
      source: `tests/browser/${source}.spec.ts`,
      project,
      file: path.relative(process.cwd(), resolved),
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
}
if (captures.length !== 108)
  throw Error("Recovery review requires 18 states in all six profiles.");
const output = path.resolve("artifacts/browser/current-recovery-review");
const note =
  "Existing screenshots from fictional functional recovery fixtures. Some fixtures simulate accepted writes; none reach real application records or providers. These are unapproved review candidates, not formal composition captures, approved content, 1% goldens, manual accessibility, actual-device or full PRD acceptance. Functional captures retain the test's scroll position, including horizontally scrolled tables or sticky bars; full-page views can include background beyond a dialog viewport. Use the separate composition review for initial layout and modal top/lower-control geometry.";
const summary = {
  generatedAt: new Date().toISOString(),
  completed: true,
  sourceInvocation: path.relative(process.cwd(), root),
  sourceReportSha256: createHash("sha256")
    .update(await readFile(path.join(root, "results.json")))
    .digest("hex"),
  stats: report.stats,
  states: states.length,
  captureCount: captures.length,
  approved: false,
  note,
  captures,
};
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
const link = (file) =>
  path
    .relative(output, path.resolve(file))
    .split(path.sep)
    .map(encodeURIComponent)
    .join("/");
await mkdir(output, { recursive: true });
await writeFile(
  path.join(output, "index.html"),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GDG GT recovery review candidates</title><style>body{font:16px/1.5 system-ui;background:#f2f3f4;color:#2d2d2d;margin:0;padding:32px;max-width:1500px}p{max-width:85ch}section{padding:24px 0;border-top:1px solid #c3c8ca}ul{display:flex;flex-wrap:wrap;gap:16px;padding:0;list-style:none}li{width:min(100%,340px)}img{width:100%;height:220px;object-fit:contain;object-position:top;background:#e4e6e7}a{color:#a93527}small{display:block}</style><h1>GDG GT recovery review candidates</h1><p>${esc(note)}</p><p>18 states, 108 original captures. No approval recorded.</p>${states
    .map(
      ([name]) =>
        `<section><h2>${esc(name)}</h2><ul>${captures
          .filter((c) => c.name === name)
          .map(
            (c) =>
              `<li><a href="${esc(link(c.file))}"><img loading="lazy" src="${esc(link(c.file))}" alt="${esc(c.name + " in " + c.project)}">${esc(c.project)}<small>Open original capture</small></a></li>`,
          )
          .join("")}</ul></section>`,
    )
    .join("")}</html>`,
);
await writeFile(
  ".docs/phase0/recovery-visual-review.json",
  JSON.stringify(summary, null, 2) + "\n",
);
console.info(
  "18 recovery states, 108 original unapproved captures indexed from the passing complete invocation.",
);
