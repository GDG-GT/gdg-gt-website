# Workspace browser accessibility recovery — November 5, 2026

The authenticated loopback browser audit found low-contrast shared topbar labels,
ghost/text actions and Forms secondary labels/tabs. These now use the existing
readable neutral text token and a darker admin-scoped coral; the public hero's
palette remains unchanged. Both active and inactive response tabs meet the
contrast check. No geometric redesign or new brand direction was introduced.

Wide tables in profile sessions, projects/participants, community members,
team memberships, Linktree and operations now have named, focusable regions.
The shared `ScrollableTable` implements ArrowLeft/ArrowRight and Home/End on the
region itself when horizontal overflow exists. This also works in mobile WebKit,
which can focus the region but did not natively scroll it for arrow keys. Nested
inputs/buttons, modifier keys, vertical arrows and fitting tables retain normal
keyboard behavior. Existing focus-visible styling applies to the region.

All 93 actual loopback read checks pass: 31 workspace routes/states at 1920×1080,
1440×900 and 375×812. This includes CMS, the Forms library, one private fixture
builder/response workspace and one fixture team. Each checks contrast-enabled
axe, one main heading, no JavaScript errors, no failed API reads, no horizontal
page overflow and working vertical scrolling. These are initial/default views,
not every populated, dialog, error or role state. All route screenshots remain
private, ignored review captures rather than approved golden baselines.

The probe creates one fictional Super Admin, one team and one private draft.
After fixture login it blocks every non-read API call; scoped realtime grant
requests receive an explicit paused response instead of opening a live socket.
No publication, send, existing account/content update or production action is
performed. Cleanup is confirmed: owned form/team archived, account disabled,
sessions revoked. The local DB survived a service interruption while Vite/API
stopped; one failed probe exited with cleanup before any browser checks. The
runner now checks the app listeners before creating fixtures.

The saved local bootstrap account was also absent, with no active local accounts
or unexpired sessions. The explicit missing-account recovery option restored
that saved account using its existing private password/gate. It cannot reset an
existing mismatched account or run beside an active account/session. All 16 fresh
local authentication checks pass; their probe session was logged out and replay
denied. See `phase0/local-bootstrap-recovery.json` and `LOCAL_RUNTIME.md`.

Private browser artifacts are explicitly denied by Vite and excluded from its
watcher. Both the ordinary artifact path and the `@fs` path reject with HTTP 403,
recorded in `phase0/local-workspace-browser.json`. Files are also git-ignored.
The existing dev-source isolation remains separate from hosted security headers.

Two focused keyboard tests and the existing profile/widget interaction set pass
(18 tests across three files). The production browser suite now includes profile,
Forms library and guide checks on all six projects, plus keyboard scrolling of
the actual overflowing session table. Its authentication/API responses are
explicit fictional fixtures; it does not certify backend role enforcement.

Final verification: all 1,224 Vitest tests/147 files pass, and all 88 applicable
production-build browser checks pass across six projects (eight expected
profile-specific skips). The earlier concurrent unit run hit the import-graph
hook's unchanged 10-second limit; the sequential full rerun passes. The mobile
WebKit keyboard failure is fixed and its actual browser assertion now passes.
No timeout or coverage threshold was relaxed for these checks. Global coverage
still fails 70%: 59.31% lines, 58.33% branches, 57.81% statements and 50.15%
functions. All 17 critical-file branch gates pass.
Types, lint (zero errors/25 inherited warnings), build, bundle budgets,
traceability and current-file/local-history secret scanning pass.

Run the real read audit with the existing local stack, API and frontend running:

```
node scripts/test-local-workspace-browser.mjs
```

The 111-migration schema did not change. Complete clean/legacy SQL and isolated
restore evidence from the form-access checkpoint is retained. Coverage remains
subject to the 70% global gate; browser/layout tests do not substitute for unit
coverage, full role-boundary tests, assistive-technology runs, 200% zoom, physical
devices, visual approval, performance or hosted acceptance. Profile and other
remaining mutation/recovery work remains open.
