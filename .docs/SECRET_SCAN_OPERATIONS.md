# Source and Git-history secret gate

Local verification, 2026-10-22. `npm run test:secrets` scans all local-ref Git
history and a snapshot of current tracked plus nonignored untracked files.
The first run covered 55 commits and 1,246 current files with no unreviewed
findings. It is evidence of a bounded scan, not proof no secret can exist.

The script downloads [Gitleaks 8.30.1 from its official release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1),
verifies a source-pinned SHA-256 before extracting/executing, checks its version,
and runs default rules with decoded-text depth five. macOS/Linux arm64/x64
archives are pinned. No project data is uploaded; GitHub receives only the tool
download request. Version changes require digest/rule review.

There is no broad baseline, rule/path exclusion or inline suppression. Two exact
source-line hashes are reviewed in `secret-scan-reviews.json`: a fictional unit
idempotency-header string and a deliberately invalid `quarantine/forged` selector
tested to return 400. Reviews must match rule, path and source-range SHA-256;
changing any of them fails closed. New findings remain blocking until inspected.

All scanner output is fully redacted and raw reports stay in a mode-0700 generated
temporary directory. Committed evidence serializes only rule/path/line/commit and
review status/reason, never Match/Secret/author/email. Generated scratch copies and
tool bytes are removed after each invocation; repository files are not removed.
Original ignored local credentials remain untouched.

Symlink targets are not followed and are disclosed in the report. Ignored local
configuration/dependencies/caches, archive contents, image OCR and unreachable
Git objects are outside this source scan. The separate build-artifact gate checks
known private configuration and forbidden emitted files. Neither gate replaces
hosted credential inventory/rotation or institutional security review.

The standalone `secret-gate` CI job checks out full history and invokes this
script without installing npm packages. Four new policy tests pass, 441 total.
It has passed locally; GitHub execution is not claimed without an actual run.
Evidence: `phase0/secret-scan.json`. Reruns update its explicit HEAD/count/scope.
