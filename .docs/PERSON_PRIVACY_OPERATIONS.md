# Person-data privacy

Local implementation of PRD 29.2; not hosted/institutional acceptance.

## Operator workflow

Super Admins open `/admin/privacy`. Independently verify the requester and their
ownership first: a matching entered email is not proof. Enter an exact email,
20–500-character purpose, explicit identity attestation, action and current
password. Review generation changes no participant records and sends no mail.

The five-minute, actor/session-bound review freezes at most 500 primary records
and their derivatives. It shows workflow, identifier, identity provenance and
holds, never answers or capabilities. A changed record, scope, password/session
or hold requires a fresh review. Approval requires the current password again
and the exact typed action/count. A hold blocks the entire erasure transaction.
Export remains available for held data; it does not release the hold.

Exact matches cover event registrations, newsletter identity/delivery, contact
inquiries/files, identified Forms responses/drafts/access and event device
reminders. Legacy encrypted access-email matches use per-form HMACs. Explicit
response IDs may supplement historical unidentified responses only after
independent ownership verification; arbitrary answer-text matching is prohibited.

Exports are private JSON downloads, bounded to 3 MiB, with sensitive Forms answers
masked by default. Explicit sensitive export includes only that person's answers.
File names/metadata are included, not file bytes, object keys or private links.
Internal registration notes, credentials, other recipients and delivery secrets
are excluded. Do not share or retain exported files unnecessarily. A lost export
response needs a fresh review: raw export contents are not saved for replay.

Redaction and deletion remove the complete attributable message/answer payload,
answer history and identity derivatives, not just name fields. Identifier-only
tombstones remain where needed. Matching queued mail/push is cancelled, access
revoked and generated Forms exports invalidated. Current exact-email matches and
pending private-file/export counters are reported separately. Refresh until
physical cleanup completes; failed cleanup remains recoverable across sessions.
Neither a completed transaction nor zero pending files is a blanket erasure
certificate. Downloaded/in-flight/delivered copies cannot be recalled.

Finance evidence, audit/security retention, officer accounts, private
collaboration and non-attributable aggregate analytics remain outside this tool.
Audit records retain identifiers, attestation, purpose/subject HMACs and counters,
not the entered purpose or exported answers. Review material expires and is
cleaned hourly; pending physical cleanup evidence is preserved.

## Permissions and Supabase defaults

Migrations 093–095 explicitly grant server access and deny browser Data API roles.
Frozen reviews and transaction-bound erasure/purge certificates are SELECT-only
for `service_role`; only fixed-search-path authenticated owner functions write
them. Do not paste generic `anon`/`authenticated` grant examples into this app.

`test:db` rebuilds without automatic API grants. `test:db:legacy-grants` also
rebuilds with old automatic table/sequence/function grants. Both run the full
security and concurrency suites. This covers the Supabase October 30, 2026 default
change locally, not a hosted project's dashboard configuration.

## Evidence and remaining acceptance

- 95-migration canonical SQL replay passed under both grant defaults, including
  both 100-client last-seat/last-response tests and all-table/browser-RPC denial.
- 351 unit tests, typecheck and 31 actual HTTP/database/private-storage privacy
  checks passed; evidence: `phase0/local-person-privacy.json`.
- 19 actual Forms permanent-deletion regression checks passed after certificate
  hardening. Only invocation-owned fictional records/files were erased.
- Actual desktop and 375px browser: review, typed/password-gated empty export,
  result focus, navigation safeguard, scrolling and no horizontal page overflow.
  Screenshots: `phase0/screenshots/privacy-desktop.png`, `privacy-mobile.png`.
  No browser destructive approval was performed. Existing admin styling was
  preserved, with explicit panel spacing and mobile wrapping.
- Hosted retention/storage/security tests, full supported-device/manual
  screen-reader acceptance and chapter identity-verification/privacy policy remain
  open. No production deployment or real participant erasure was performed.
