# Keyboard access to review panels — 2026-11-07

Campaign delivery results, registration chart data, campaign recipient and
message reviews, and event recipient reviews now support keyboard scrolling.
Existing visual styles, list semantics, data and approval requirements remain.

The campaign delivery table originally produced a serious
`scrollable-region-focusable` finding in both mobile browser engines. It now
uses the existing named `ScrollableTable`; the chart's equivalent plain-text
table received the same correction during the source audit. A longer campaign
review fixture then reproduced the same finding in both its recipient list and
message preview. Those panels, and the equivalent event recipient list, now
have descriptive names, focus targets and vertical keyboard handling.

`scrollWithKeyboard` preserves the table's horizontal behavior and adds
ArrowUp/Down, PageUp/Down and Home/End for bounded vertical reviews. It leaves
nested controls, modifier combinations, unrelated keys and nonoverflowing
content alone. Three unit cases cover movement, endpoints, bounds and those
exceptions. Native lists retain their list semantics.

The final combined invocation passes **222 checks across six browser profiles**:
37 secondary states and 270 screenshots, with no failures, skips or retries.
Tests require actual overflowing review content and verify focus, movement and
endpoints. Long campaign reviews contain 18 fictional recipients and 24 message
paragraphs; event reviews contain 18 fictional attendees. Required approval
proof is empty, approval controls remain disabled and no approval is submitted.
Review POST responses are supplied entirely by fixtures. No real server receipt,
frozen audience, upload, publication or provider send is created.

WebKit mobile campaign and event review captures were inspected for complete
vertical flow and reachable controls. The screenshots remain **unapproved
review candidates**. This does not establish human fidelity, physical-device,
assistive-technology or complete PRD acceptance. The initial fixture locator
failures and real accessibility failures are retained separately from the
passing final invocation.

Evidence: `../phase0/communication-scroll-secondary-browser.json` and
`artifacts/browser/secondary-review/index.html`. Broader current-source coverage,
artifact and performance results are tracked separately in `CURRENT_CHECKPOINT.md`.

## Further form review

Seven more form states now pass 42 checks across all six profiles: collaborator
access, published-version comparison, publication review, response revision
history, retention and holds, export review, and sensitive-answer reveal.
Every application mutation is refused by those fixtures. Publication, export,
privacy and access controls are inspected without committing their actions.

The first desktop diagnostic passed four cases and found three failures. Two
were real accessibility defects: publication summary text had 4.14:1 contrast,
and the history reveal checkbox had an 18px target with insufficient adjacent
space. The summary now uses existing primary/secondary text tokens; the history
control has a 24px checkbox within a spaced 44px label. The third was an immediate
`check()` assertion racing a router-controlled checkbox update (the retained
failure snapshot already shows it checked). The test now clicks and explicitly
waits for checked state, URL, sensitive read and displayed answer. No production
toggle logic, timeout or rule was changed for that harness correction.

Mobile access and version-comparison captures were inspected, including modal
scrolling to lower controls. These remain unapproved emulated review candidates.
Evidence: `../phase0/form-review-initial-browser.json` and
`../phase0/form-review-final-browser.json`. The complete expanded combined scope is
verified separately; isolated passing cases are not a full-inventory pass.
