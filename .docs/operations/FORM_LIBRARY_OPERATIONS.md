# Authorized Forms library filters

FORM-018 local implementation, 2026-10-22; not full PRD acceptance.

The library now combines title search, owner, team (including chapter/no team),
state, updated-date range and template-origin filters before counting/paginating.
Dates include the entire selected UTC day, explicitly labelled in the UI. Sorting
is deterministic by updated timestamp and ID. Invalid/repeated query parameters,
impossible dates, reversed ranges and unsupported filters fail validation.

“More filters” expands inline, with existing restrained neutral/coral controls.
Owner/team options are searchable and paginated, contain only names/IDs referenced
by currently accessible forms, and never expose account emails. There is no broad
account-directory endpoint. Responses to abandoned searches are aborted/ignored;
account/role transitions remount the library context. Clear/reset, loading,
failure/retry, selected-on-another-page, no-match and mobile states are supported.

Migration 099 adds creation-provenance metadata and indexes, a transactionally
authorized creation entry and service-only filtered inventory/option RPCs.
Template creation and duplication preserve origin, not answer data. Existing
unknown origins remain NULL and can be filtered as unspecified; no historical
definition/schema hash is rewritten. Origin describes a starting point, not a
promise that questions have never been edited. Existing creation authorization,
media checks and audit still execute inside the transaction.

## Evidence

- Five new unit tests; 402 total units, strict types and zero lint errors pass.
  Lint still has 245 warnings; broad coverage requirements remain open.
- 99 migrations, full canonical SQL and both 100-client races pass with both new
  no-automatic-grants and legacy Supabase defaults. New SQL checks scope, grants,
  inclusive boundaries, pagination, provenance, unauthorized/anonymous actors,
  invalid filters and immediate membership revocation.
- `npm run test:local-form-library -- --hold-for-browser`: 18 actual local
  HTTP/DB checks. Fictional forms/accounts/teams are recoverably archived, not
  permanently erased. No external delivery or deployment.
- Existing native Forms/upload HTTP/storage/scanner suite: 124 checks pass.
- Chrome desktop and 375px: combined owner/team/template/date filters return the
  expected exact form; empty/reset states work, native date keyboard changes
  commit, and document/main widths remain 375px. Evidence:
  `../phase0/form-library-filters-{desktop,mobile}.png` and
  `../phase0/local-form-library.json`.
- Production build and public/offline byte/artifact budgets pass. Complete runtime
  performance, supported-device/screen-reader and hosted acceptance stay open.
