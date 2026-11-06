# Populated production-build review — 2026-11-06

## Secondary-state continuation

Nine additional read-only states now pass across all six profiles: populated
response analytics, individual response details, media metadata, builder logic,
builder settings, team announcements, team chat entry, a populated channel and
saved campaign preview. The final 54-case invocation has no failures, retries,
page exceptions, unexpected API reads or application writes. Its 72 captures
include top and lower-control views of each of the three long dialogs. Modal
captures use the viewport so the review does not show background content beyond
the modal's real viewport overlay. Review `artifacts/browser/secondary-review/index.html`;
evidence is in `phase0/secondary-visual-review.json` and
`phase0/secondary-composition-browser.json`.

This review exposed an actual chart-layout defect: inherited two-column styling
put answer bars beside unrelated headings, and native meters rendered green.
Question summaries now keep their headings, statistics and answer rows together;
the bars use coral in Chromium, Firefox and WebKit. Each meter has an explicit
question/answer label and value text. Browser geometry assertions check that
bars follow their own heading and do not overlap their labels. Counts remain
visible, so interpretation does not depend on color. Mobile analytics and
WebKit mobile settings captures were inspected locally.

The first desktop diagnostic passed seven cases and failed two builder cases
because the test looked for an inline inspector after explicitly opening a
dialog. The locator was corrected; no product or timeout change was needed for
that fixture error. The chart fix then passed all 60 secondary/existing-response-
read cases. A separate 54-case invocation produced the final dialog captures on
the same build. Twenty-four response-workspace/traceability unit cases, strict
types, build and byte gates pass; lint remains zero errors/10 existing warnings.
Primary and supplemental index generation also succeeds. Twelve existing
project/Linktree captures are now explicitly included in the primary index.

These nine states do not cover every secondary or confirmation state. Remaining
review includes full team tasks/direct-message/whiteboard workflows, campaign
audience/delivery review, media upload/publication, event editor/attendees/mail,
builder access/version/publish states, response history/privacy/export/reveal,
and applicable content/account/operations dialogs. Existing functional checks
do not substitute for complete visual/device/manual acceptance. No baselines,
human approval or full-PRD completion are inferred.

## Earlier primary baseline

The complete broad production-build invocation passed 1,228 cases with eight
expected skips and no failures or retries. It includes all 138 populated primary
composition cases across Chromium at 1920×1080, 1440×900 and 375×812, Firefox at
1440×900, and WebKit at desktop/mobile sizes. The final drawer/search correction
then passed a separate 90-case rebuilt-artifact scope. Those are separate
invocations; no single new 1,242-case run is claimed. WebKit is not a certificate
for actual Safari or physical devices.

Each populated check asserts visible fixture data, a single page heading, axe
results, document overflow, available vertical scrolling, no page exceptions,
no unexpected API calls and no application writes. The read-only fixtures
contain fictional identities, future events and explicitly illustrative assets.
No database records, credentials or provider sends are involved.

All 22 design prompt groups now have primary-composition captures at all six
profiles: 162 screenshots in total. Open
`artifacts/browser/visual-review/index.html` to browse the grouped local images.
`phase0/populated-visual-review.json` records the mapped image paths and the
actual passing invocation. The generator refuses missing/duplicate captures or
failed/retried cases. CI attaches the images to Playwright reports; browser
execution now uses three shards without changing any timeout, retry or assertion.

This is a review set, not approval. Complete prompt fidelity, approved chapter
content and assets, secondary drawers/inspectors/charts/collaboration states,
manual keyboard and assistive-technology paths, physical-device behavior and
approved 1% screenshot comparisons remain separate gates. The 22 `VIS-TEST`
catalog entries remain explicitly unverified.

The initial workspace fixture run passed seven cases and failed the response
locator because it expected an exact standalone email text node. The rendered
table correctly placed the respondent name and email in one cell. The final
check targets that cell; no product change or timeout adjustment was made.
Initial output is retained in ignored local artifacts and `/tmp` logs. All 48
workspace cases then passed, followed by the final combined 138-case invocation.

Representative mobile finance and builder captures, desktop overview and media
captures were inspected locally. Tables preserve their contained horizontal
scrolling while the document stays within the viewport. This observation does
not imply review or approval of every captured state.
