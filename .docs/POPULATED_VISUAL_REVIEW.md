# Populated production-build review — 2026-11-06

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
