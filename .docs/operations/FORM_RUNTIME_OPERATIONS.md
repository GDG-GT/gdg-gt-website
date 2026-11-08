# Typed respondent fields, focus and pending-operation safety

FORM-004/012/026 local checkpoint, 2026-10-22. Full accessibility, supported-device
and complete PRD acceptance remain open.

## Changes

- Calendar and local date-time validation rejects normalized impossible dates,
  offsets, trailing input and invalid time components. Range comparisons normalize
  minute/second/millisecond precision without depending on the server timezone.
  Malformed/reversed bounds fail publication. No published definition is rewritten.
- Scale/rating bounds are whole numbers from 0 to 10, matching the existing
  builder's bounded scale. Invalid draft scales do not allocate arbitrary arrays.
  Responses must be actual displayed scores, not fractional or alternate numeric
  representations. Number fields retain finite decimal/exponent support but
  reject hex/binary/octal strings. Exact choice strings preserve branch identity.
- Ratings/scales use native radio controls with ordinary arrow-key single-choice
  behavior, visible selected/focus states and associated error/help text. Grid
  headers have explicit column scope. File questions have focusable fieldsets,
  labelled upload controls and associated field/upload errors.
- Declared identity errors are inline, associated and announced; validation
  focuses the first invalid presented field. Server-provided field errors return
  to their section. Editing clears stale summary errors. Review and successful
  submission focus their headings.
- Pending save/submission freezes identity, questions, file controls and consent
  options. An in-memory operation latch prevents concurrent form operations.
  File status/removal participate in busy navigation protection; completion clears
  the busy state even if conditional rendering hid the field meanwhile.
- Unfocused skip links are genuinely clipped, preserving keyboard reveal without
  offscreen/full-page capture artifacts. Existing neutral/coral design is retained.

## Evidence and boundaries

- Eight new field-contract/render tests; 410 units at this scoped checkpoint,
  strict types, zero lint errors and production build/byte gates pass. Lint still
  has 245 warnings; this does not close broad coverage or accessibility gates.
- `npm run test:local-form-runtime -- --hold-for-browser`: nine actual local
  HTTP/DB checks, including rejected fractional/noncanonical scores, impossible
  dates/offsets/range overflow, unsafe number representations and a committed
  valid decimal/equivalent-precision response. Fixture account/form archived.
- Chrome keyboard: first-invalid name/rating focus and error association, Space
  and ArrowRight single selection, native date-time keyboard entry, decimal input,
  review-heading focus and real committed submission/success-heading focus.
- An explicit transaction temporarily locked only the fictional fixture form row.
  Its actual save waited; rating, number and file controls were verified disabled.
  The transaction was rolled back immediately, save completed, controls re-enabled.
  No application record or security limit was changed for this check.
- 375px document width remains 375px. Screenshots:
  `../phase0/form-runtime-keyboard-mobile.png`, `../phase0/form-runtime-submitted.png`.
- The existing 124-check native Forms/upload regression passes. An earlier rerun
  reached the persistent submission quota (verified HTTP 429); the rerun passed
  after slots expired naturally. No rate reset, forwarded-IP spoofing or limiter
  exception was used. The separate respondent-copy regression also passes all
  16 actual identity/HTTP/DB/local SMTP checks after natural quota expiry, including
  exact own revision, one intended recipient, no CC/BCC and no private review link.

These are local functional/keyboard checks, not manual screen-reader, all-browser,
hosted scanner/storage, load, institutional or launch certification.
