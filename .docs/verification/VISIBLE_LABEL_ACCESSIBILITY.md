# Visible labels and accessible names

The public-reader performance review found a WCAG 2.5.3 failure even though
Lighthouse's aggregate accessibility score was 100. The shared browser axe helper
selected WCAG 2.0 A/AA and later AA tags but omitted the WCAG 2.1 A tag containing
`label-content-name-mismatch`. The helper now includes 2.1 A and 2.2 A. Forty
existing local probe scripts also include 2.1 A; their syntax checks pass, but
previous database/API mutation probes were deliberately not replayed. Their old
results do not certify the newly selected rule.

The stronger audit identified four shared problems:

| Surface | Correction |
| --- | --- |
| Public/workspace brand links | Names include the visible `GDG@GT` identity and the home destination. |
| Workspace search | Name includes the visible search text and shortcut; `aria-keyshortcuts` exposes both supported keyboard combinations. |
| Form-builder question controls | Names begin with their visible field type, followed by Edit/Inspect and the unique question label. |
| Public gallery cards | Native content naming retains image alternatives, event titles, captions and the visible View photo action. Explicit whitespace separates labels; the arrow is decorative. |

The initial complete-inventory diagnostic was intentionally interrupted after
26 passes and 57 failures exposed the shared search/builder issues. Its 1,237
skipped cases predominantly represent unexecuted cases after interruption.
`../phase0/wcag21a-interrupted-browser.json` records that limit.

A subsequent complete 1,380-case invocation passed 1,366 cases, skipped eight
expected cases and failed only the six populated-gallery checks, one per profile.
It included all ten new event/attendance/email/lifecycle review states. This is
preserved in `../phase0/wcag21a-complete-before-gallery.json` and the original raw
report `/tmp/gdg-accessible-complete-browser.json`. It is not a clean invocation.

The gallery correction subsequently passes all six affected browser profiles and
27 unit cases across two files. The first unit diagnostic exposed missing
whitespace between the image alternative and caption; the final source explicitly
separates them. The earlier shared-name correction also passes 44 focused unit
cases and the 20-case desktop secondary/archive browser diagnosis. Original
assertions remain, with exact name expectations updated to the corrected product
labels. Timeouts, retries and coverage gates are unchanged.

The final complete browser invocation passes **1,372 cases/eight expected skips**,
zero failures or retries, on the rebuilt gallery fix across all six profiles.
`../phase0/visible-label-complete-browser.json` binds the actual build and raw test
results. The strict secondary index regenerates successfully with nineteen states,
114 composition checks and 162 unapproved captures. The same actual invocation
also refreshes all22primary prompt groups (138checks/162captures) at
`artifacts/browser/current-primary-review/index.html`; no duplicate browser run
or fabricated captures were needed. These are separate from the retained failed
invocations.

The first full coverage run has2,683passes/four failures: two overlooked old
builder-name expectations and two response-workspace MemoryRouter URL assertions
that sampled before the navigation transition finished. After exact name updates,
all33cases in those two files pass in isolation with the original URL assertions.
The two URL checks now explicitly await the exact blank query through the existing
default `waitFor`, rather than depending on an unrelated denied-heading paint.
Immediate private-field withholding and no-retry-loop assertions are preserved;
no response-workspace product code or timeout is changed. The original failed
run remains in `../phase0/visible-label-initial-quality.json`. The second full
coverage invocation passes those cases but has four different failures, including
slow/time-limited cases (`../phase0/visible-label-second-quality.json`). A four-file
isolation with two workers passes40/43; the unchanged builder file then passes
all28cases with one worker. No product recovery code, test timeout, retry or
coverage threshold changed. Final complete one-worker coverage remains required;
the passing browser invocation does not certify that separate gate. The
performance probe now explicitly requires the visible-label audit to pass in
addition to the original score, LCP and CLS gates. It has not yet been measured
on this rebuilt artifact. Aggregate scores never substitute for individual
findings or manual assistive-technology/device acceptance.
