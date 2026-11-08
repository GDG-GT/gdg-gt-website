# Structural accessibility regression checks

`npm run test:a11y:structure` runs 19 representative DOM cases with the pinned
development dependency `axe-core@4.14.0`. They also run in ordinary `npm test`,
including CI's existing unit step. Definite WCAG 2.0/2.1 A/AA and best-practice
violations fail the cases; moderate findings are fixed too, rather than filtered
away to meet the PRD's critical/serious floor.

Coverage includes the real public shell with Home, Events, Team, Resources,
Sponsors, Gallery, Contact, Offline help and 404; populated team/resource/sponsor
cards; public form/rating/grid/ranking validation; the real gallery dialog; event
detail/server validation and load failure; builder Field/Logic inspectors; and
response table/summary/filter states and the real notification dialog. Only network/content inputs, session/guard
context, queue storage and the WebGL hero scene are replaced in these fixtures.
These tests do not exercise authorization, real storage, delivery or WebGL.

The checks found and fixed skipped heading levels in public list empty states
and Contact's reason cards, and duplicate unnamed complementary landmarks in
the builder. EmptyState now accepts an explicit semantic heading level without
changing its visual style. The event read-failure state has a page-level heading.
The builder field library and form inspector have distinct accessible names.

JSDOM has no pixel/layout engine. The sole disabled axe rule is `color-contrast`;
the unsupported canvas context reports null, not fabricated geometry or pixels.
The run also reports these incomplete rules for manual follow-up:
`aria-hidden-focus`, `label-content-name-mismatch`, `landmark-one-main`,
`page-has-heading-one`. A zero definite-violation result does not certify those
incomplete checks. Real-browser axe, contrast, Lighthouse accessibility 100,
keyboard/zoom/screen-reader, responsive layout and supported-device acceptance
remain mandatory and open.

Local result: 19 structural cases pass, and the complete 839-test/123-file suite
passes. Strict types pass; lint is 0 errors/25 warnings. Global coverage is
35.86% lines/33.94% branches, below 70%; all 17 critical-file branch gates pass.
Fresh dependency audits have zero high/critical findings: production two moderate/
four low; full tree four moderate/five low. Adding axe changed only its pinned
package/lock entry; it is absent from the shipped application imports. The
pre-existing dependency-cache symlink was restored after npm materialized a
redundant install; only that just-created duplicate was removed.

Actual Chrome DOM/native accessibility inspection confirms Contact's H1 followed
by H2 reason/form headings. A native screenshot verifies the visual hierarchy:
`../ui-review/accessible-contact-headings.png`. The temporary native test tab was
closed, preserving the user's original New Tab and its zoom. No contact data was
submitted. This is a local regression checkpoint, not full PRD or visual approval.
