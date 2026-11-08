# Gallery filter and lightbox interactions

Implemented locally on 2026-10-26 against PRD 22.8/28.3. The public gallery RPC
already returned approved event choices, but the API discarded them. The API
now explicitly projects each choice's ID/title. Existing SQL only derives these
choices from currently approved, publicly readable images and published events;
no extra access or private event discovery is granted.

The gallery restores event/page selections from its URL, resets page on event
change, preserves event on paging and provides recovery for an out-of-range
page. Shared collection loading/retry/error handling rejects superseded reads
and distinguishes a failed request from a truly empty gallery. A selected event
remains represented while its options load.

Lightbox captions receive keyboard focus on open and arrow/button browsing.
Close/Escape returns to the actual opening thumbnail, even after browsing other
photos. If that control no longer exists, focus returns to the content landmark.
Failed thumbnails/detail images retain accessible text, captions and controls;
they do not substitute unrelated chapter photography. Download remains present
only when the server grants it. The close target is at least 44px and the dialog
has a viewport-bounded scroll area with room for long captions.

Eight DOM interaction cases and one API projection case were added. All 704
tests/114 files pass, strict types pass and lint is 0 errors/25 warnings. Global
coverage is 30.90% lines/29.55% branches, below 70%; all 17 critical branch gates
pass. Forty-six actual media checks pass using real local signed object uploads,
ClamAV, bounded image processing, native media probing and protected/public HTTP
reads. This includes retaining real event options and filtering associated
approved images. Existing file-cleanup evidence remains scoped to generated
fixtures; no real chapter file was used or removed.

Native Chrome verified caption focus, Right-arrow browsing, conditional download
and Escape return to the original thumbnail. At 375px the dialog fits within the
viewport, has an auto-scroll area and a measured 44×44 close target. Evidence
`../ui-review/gallery-keyboard-lightbox.png` deliberately shows a generated blue
rectangle, not approved chapter photography. The temporary publications were
revoked, exact files/event archived, accounts deactivated and sessions revoked
after review. See `../phase0/local-media-files.json`.

Screen-reader behavior, complete browser/device/zoom coverage, official copy and
imagery, visual baselines, hosted image CORS/cache/scanner/load/retention and
production acceptance remain open. No database migration was required.
