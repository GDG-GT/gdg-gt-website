# Private invitation and announcement reads — November 5, 2026

Each team child panel owns a keyed private read, retry, last-success timestamp
and scoped cancelable mutation transport. A temporary read failure retains the
matching rows and unsent fields with changes paused. An initial failure never
renders a successful empty state or fabricated zero count. Rechecking one panel
does not reload the selected team or the other panel; focus returns to the
named panel after retry. Invitation history has a named keyboard-scroll region.

Read/write denial and session invalidation clear private rows, pending targets,
credentials and unsent drafts before explicit current-access rechecking.
Team replacement unmounts private state, cancels transport and ignores late
responses; the enclosing workspace already remounts on account/role/session
replacement. Offline/parent-read failures pause controls. Reconnection does not
automatically read or submit. Current capabilities and selected row revisions
gate writes. Stale drafts remain visible but cannot be saved until closing is
reviewed and a current action is chosen. Local page/filter/cancel actions pass
through the existing draft navigation guard.

Twenty-four new DOM cases and the three existing actual child-pause cases pass.
Together with parent read/mutation regressions, all 64 focused cases pass.
The actual loopback API/DB and desktop/mobile Chromium probe passes all 30
checks: anonymous/unrelated-member denial, private uncached capability-free
projections, initial/temporary failures, retained drafts, named focus recovery,
denied-state clearing, populated measured axe and no unintended browser writes,
external requests, script errors or horizontal page overflow.

The owned invitation was seeded with an unrecoverable fictional token hash and
no delivery job; the owned announcement was never published. Both rows stayed
unchanged through the read checks before recoverable fixture cleanup. The team
was archived, invitation cancelled, post archived, accounts disabled and sessions
revoked. No existing chapter data, provider send or production change occurred.
Evidence: `../phase0/local-team-child-read-recovery.json`; screenshots are private
ignored review candidates.

Atomic child mutation replay, full uncertain-write recovery and complete
consequence review remain a separate implementation checkpoint. This read
checkpoint does not certify complete Teams or website acceptance.

All 1,440 tests/161 files pass. Full-tree coverage remains below the global 70%
gate: 63.58% lines, 63.44% branches, 61.94% statements and 55.19% functions.
All 17 critical-file branch gates pass. Catalog: 153 unverified logical cases.

Types/lint (zero errors/25 warnings), production build, final byte budgets,
secret scan and traceability pass. A premature byte check ran during the build
and found no manifest; the final completed-build check passes. All 72 targeted
production-build child-read/team-review/shared-workspace checks pass across six
pinned profiles. Evidence: `../phase0/team-child-read-workspace-browser.json`.
Populated desktop/mobile captures were inspected; they remain unapproved review
candidates, separate from manual accessibility and real-device acceptance.
