# Forms validation controls — local checkpoint, 2026-10-24

FORM-004 now exposes the existing server-enforced file policy in the builder:
1–10 files, precise per-file MiB size up to 25 MiB, and a PDF/DOCX/text/PNG/JPEG/
WebP allowlist. At least one format remains selected. Existing absent settings
retain their prior defaults; this does not rewrite any published version or
make private uploads public. The response-wide file limit and scanner remain
independently enforced by the existing transaction and upload paths.

Text questions expose the existing restricted anchored pattern rule. Invalid
patterns have associated announced errors and cannot save/publish. The builder's
readiness summary also flags invalid patterns and file limits. Pattern-matched
answers retain the existing 512-character bound; no arbitrary regex engine or
executable content was introduced. Normal text without a pattern is unchanged.

Four focused tests cover rendered labels/states, persisted schema boundaries,
safe/unsafe patterns and unrelated field types. Actual browser editing, reload
and authenticated API readback verified three files, 1.5 MiB (1,572,864 bytes),
PDF-only and `^[A-Z0-9]+$`. The last remaining format cannot be unchecked; an
unsafe nested-quantifier pattern produces the associated error. Only the
invocation-owned draft was then recoverably archived, not permanently erased.
Evidence: `../phase0/local-form-validation-controls.json` and
`../ui-review/form-validation-file-settings.png`.

This closes the missing controls, not complete FORM-026 manual screen-reader,
supported-device, visual-baseline, hosted scanner/storage or full PRD acceptance.
