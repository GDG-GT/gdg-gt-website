# Unused tracked helper retirement and active workflow checks

Work checkpoint after `dd7d785` on 2026-11-06. The full import/reference audit found
47 tracked helpers with no path from either shipped HTML root, all static/lazy
application imports, tests/scripts or existing untracked source. No unresolved
local/opaque imports were reported. All 207 shipped source modules and all 228
referenced modules remain. Existing user edits and both untracked `* 2` files are
preserved. The candidate files were unchanged before removal; SHA-256 values are
recorded in `phase0/unused-helper-retirement.json`.

The local reference `reference/shared-ui-before-retirement-20261106` points to
`dd7d785`. `git show reference/shared-ui-before-retirement-20261106:path/to/file`
recovers any retired source. This retires unused generic UI wrappers and obsolete
loading/responsive/preload utilities; no active route/workflow, SQL, user file,
installed package/cache, production or remote state was removed. The dynamic hero,
offline entry and private route import boundaries remain covered. Existing default
retirement graph also protects dependencies of untracked work.

Coverage attribution must remain explicit: the retired helpers had 266 functions,
zero exercised by the previous suite. Removing them changes the denominator from
6,092 to 5,826; it establishes no new behavior evidence. The unchanged global 70%
and each critical 90% branch gate remain. New active workflow tests separately
exercise and assert full project records/date correction, Linktree profile
backgrounds/appearance/embeds/public destinations, multi-field Forms validation/
settings with exact autosaved definition and confirmed newsletter audience paging/
template copying/consent. All 106 focused workflow/architecture checks passed before splitting the long
Forms workflow; all 28 builder tests pass after that split.

A new subscriber test exposed that email validation returned normalized data but
the editor sent its original input. The editor now sends the validated normalized
record, preserving stable canonical intent without changing consent or delivery.
All new sends are mocked transport assertions; no opt-in or campaign email was sent.

Strict types/build pass after retirement and the normalization correction. Lint
now has zero errors/10 existing warnings (previously 25); its CI ceiling has not
been relaxed. Public/offline byte budgets, current/history secrets and traceability
pass. Offline raw install decreased from 496,586 to 463,659 bytes by dropping
unused generated CSS; runtime Web Vitals remain a separate measurement. Final full run: all 2,649 tests/210 files pass, all four unchanged global 70% gates
and all 21 critical 90% branch gates pass. Lines 77.73%, statements 75.79%,
branches 75.40%, functions 70.35%. New active workflows exercise 99 additional
functions separately from the denominator change. The first long builder test
exceeded five seconds under coverage; split by independent validation groups with
all exact saved-definition assertions preserved, no timeout/gate change. See
`phase0/workflow-coverage-quality.json` and the retained initial report.

Next: inspect full results, run the complete production-browser suite (inventory
1,062 cases/38 spec files across six profiles) sequentially, correct real failures,
complete local performance/PWA/security/visual candidate work and final audit.
Screenshots remain unapproved; manual AT/devices, human visual/retention/brand and
hosted acceptance cannot be inferred. SSO/Google and Bevy/Engage stay deferred;
no deployment/provider sends/production changes/purchases/new timer/AI trailers.
