# Local functional verification — 2026-11-07

This continuation follows the request to complete the functional verification,
with visual approval excluded. The goal is a working local application. Production
keys, deployment and real provider sends are outside this task and are not counted
as missing local features. SSO/Google and Bevy/Engage remain explicitly deferred.

## What the additional checks found

A populated audit history exposed a real accessible-name mismatch: the visible
command was “View details” but its accessible name began “Details for”. It now
begins “View details for …”, and a regression assertion checks that the complete
visible command occurs in the accessible name. The fresh actual workspace browser
run passes all 93 route/viewport checks; the populated audit read/recovery run
passes 23 checks. Original failing observations remain separate.

Notification badge polling now aborts superseded reads, hidden/pagehide reads and
unmounted work, and ignores a late result from an older read. Two new regression
cases verify stale-count ordering and cancellation. All 2,757 source tests in 228
files pass the unchanged global 70% and all 22 individual 90%-branch gates.
Final coverage after the menu fix: 78.23% lines, 76.18% statements, 71%
functions, 75.66% branches.

The first overloaded coverage run timed out three existing 5-second tests while
other heavy jobs were running. That raw report is retained. The isolated complete
run passed; no timeout, retry, assertion or coverage threshold was relaxed.

## Real backend workflows

`scripts/test-local-functional-flows.mjs` uses the actual UI, API, PostgreSQL and
local SMTP, with a fresh fictional account and explicitly owned fixture records.
No application response is replaced. External origins are blocked. The workflow
checks cover:

- Hidden entry with Enter and the already-supported explicit Shift+Enter path,
  actual credential sign-in and an HttpOnly session without persisted secrets.
- Event creation and publication in the UI, public registration, exactly one
  saved attendee, and a real calendar download.
- Community member creation/edit, actual CSV file upload, reviewed import,
  filtered private export and the received browser download contents.
- Required declared name/email, a real published form submission, saved response
  review and exactly one respondent-requested copy. The actual copy renderer and
  local SMTP message contain the exact question/answer and only the entered
  recipient, without CC/BCC or an admin link. Only the owned job is leased; no
  unrelated pending mail is claimed.
- “Mark all read” changing to “Dismiss all”, verified against the saved inbox.
- Real confirmation/unsubscribe capabilities: opening the page leaves the saved
  preference unchanged; the explicit button performs the expected transition.

All six final Chromium/Firefox/WebKit desktop and mobile-width profiles pass
24 checks each: 144 checks across 36 scenario executions. Every profile reports
zero page errors. The latest Firefox/WebKit mobile invocations also observe actual
window error/unhandled-rejection events directly and report zero; older profiles
do not claim that extra observer. See [the profile reports](phase0/local-functional-flows.json).
These are automated browser engines and widths, not physical device acceptance.

Earlier WebKit invocations completed the workflow transitions but reported a
cancelled notification-count fetch during immediate full-document replacement.
The installed Playwright WebKit implementation emits JavaScript-source console
errors as `pageerror`, so that report alone does not prove an unhandled Promise.
The workflow runner now settles visible read refreshes before replacing a whole
document for its next scenario. The exact zero-page-error assertion remains;
errors were not filtered. Cancellation/order behavior has its own regression
checks. The original failing reports are preserved.

Repeated sign-ins hit the real local safety quotas. No windows were cleared or
limits changed. The test preflight observes capacity and waits for natural expiry
before creating fixtures. It is not a quota reservation; auth-dependent suites
must be run sequentially. Both supported entry paths have separate evidence.

## Final browser failure investigation

The complete frozen-artifact invocation executed exactly the listed 1,812 unique
identities: 1,802 passed, eight expected skips, two failures, zero retries. It is
not relabeled as a passing full invocation. Its original raw reports and captures
remain in `artifacts/browser/native-final-20261107/reports`.

The menu failure was real. Exit-only waits and then focus-plus-exit waits still
failed. Attached state diagnostics showed a focused `data-state=open` menu,
`animationName=none` and no running animations after Escape. Forms library now
controls the active actions menu and handles Escape directly in its capture path,
including the layer-registration handoff, while preserving normal Radix behavior.
Denial clears the active menu. The regression asserts opening focus, dismissal,
complete portal removal, root accessibility and trigger focus before the same axe
assertion. It passes three repetitions across all six profiles (18 checks).

The unchanged two original desktop hero-motion checks pass in isolation, and both
pass again in the final affected public/Forms scope (178 passes/eight existing
skips). Shared-load sensitivity is an inference, not a proved GPU diagnosis.
No hero code, motion requirement, timeout, retry or accessibility gate was relaxed.
These separate invocations are recorded honestly in
[the final local evidence](phase0/local-functional-release-20261107.json).

The final application build, types, byte budgets, SSR 25, PWA 15/update 9 and HTTPS
52 pass. All six fresh Lighthouse gates pass; mobile LCP Home 1,953.247 ms,
Events 903.679 ms, Contact 901.993 ms. The performance fixture intentionally
returns anonymous session 401; that network response explains its console audit
and best-practices score of 96. It is distinct from an uncaught application error.
No field-performance or physical-device claim is made.

## Subsequent production authorization

The user now authorizes pushing to the GDG-GT GitHub organization and deploying
the finished application. This supersedes the earlier local-only boundary.
The provided provider credentials are not recorded here or in Git. Discovery
found gdggt.dev, the GDGGT Vercel team, the GDG@GT Supabase project and a verified
Resend sender domain. Production setup and its actual results are separate from
the local evidence above; no deployment is claimed merely from successful local
checks. First-owner identity, persistent worker/scanner hosting and Cloudflare account email for global-key DNS access were requested while independent work continues.

## Actual browser zoom and accessibility

164 checks pass across 41 routes at both desktop window widths, each in normal and
browser-emulated forced-colors rendering. This uses Chromium's actual
`tabs.setZoom(2)` in automatic mode, not CSS zoom or a resized test viewport.
Assertions verify `getZoom() === 2`, halved `innerWidth`, doubled pixel ratio,
unchanged browser window width and CSS zoom 1. The private profile and temporary
extension are removed afterward. See
[the zoom evidence](phase0/local-actual-browser-zoom.json).

The user authorized a temporary native VoiceOver test. VoiceOver was initially
off; its caption-panel preference was already enabled. It was enabled temporarily
and native Safari exposed the real Contact headings, required field names and
help text. The computer-use tool could not reliably expose the separate speech/
caption output and later returned `noWindowsAvailable`. Full critical-path
screen-reader acceptance was therefore **not passed**. VoiceOver was restored to
off and verified in System Settings; the caption preference was unchanged. See
[the actual attempt](phase0/local-native-voiceover-attempt.json). This is distinct
from axe, native accessibility-tree inspection and emulated WebKit.

## Evidence boundaries

The evidence inventory links the reviewed PRD mapping to recorded real-service
reports, current executed unit files and canonical SQL checks. Historical native
runs remain historical; file presence or a mapped test alone is not a feature
completion certificate. The complete 140-migration normal and legacy-grants
suites, both 100-client last-slot tests and isolated restore were already completed
and are not replayed. The fresh live scanner accepts clean text and rejects the
standard in-memory antivirus test signature.

Actual supported-device installation/push, full human screen-reader acceptance,
physical Safari/mobile keyboard/orientation behavior and real OS high-contrast
review remain outside what the successful automated runs prove. Visual approval
is excluded by the user's latest scope. These limits must stay explicit; they
must not be turned into a false “every possible scenario verified” claim.
