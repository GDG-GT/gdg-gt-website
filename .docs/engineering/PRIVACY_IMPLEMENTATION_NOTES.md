# Cross-system privacy workflow — implementation decisions

Required by PRD 29.2; this design note is not completion evidence. Local
implementation and verification are recorded in `../operations/PERSON_PRIVACY_OPERATIONS.md`.

Scope: exact-email event registrations, newsletter identity and delivery
derivatives, contact inquiries/files, captured Forms name/email (with explicit
self-reported versus access-link/account provenance), linked drafts/files and
per-event Push data. Historical anonymous Forms cannot be attributed
reliably from an email string in an arbitrary answer. Require explicit reviewed
response IDs when chapter officers have independently verified such ownership;
never silently delete somebody else's answers from a substring match.

Use a restricted Super Admin workflow with current session/password, an explicit
requester-identity attestation, purpose, five-minute immutable record review,
typed action/count, idempotency and identifier/hash-only audit. Review/export
never sends mail or changes subscriber consent. Export excludes private storage
keys, capabilities, cryptographic hashes, other recipients and internal notes;
sensitive Forms answers require a separate explicit selection. No private result
enters offline storage. Exported copies cannot be recalled.

Retain audit evidence and finance records/attachments; do not alter officer
accounts, private communications, institutional records or existing holds. Form
and contact holds must be visible and rechecked transactionally, never bypassed.
Do not claim erasure complete while held records, unprocessed matching batches,
physical file cleanup, old generated exports or externally delivered copies
remain. Identity redaction must handle free-text/file derivatives conservatively,
not imply that a name-field heuristic guarantees anonymity.

Implementation sequence:

1. Strict shared request schema and exact identity inventory/review/export.
2. Reviewed redaction/deletion using existing held-file cleanup contracts, with
   narrowly constrained tombstone exceptions for immutable recipient identities.
3. Restricted responsive workspace/guide, complete negative SQL/unit tests and
   actual synthetic-only HTTP/storage tests; no browser destructive final action.
4. Scheduled review/derivative cleanup and accurate privacy/retention status.

New Forms always require entered name/email (092); that is not proof of ownership
for a privacy erasure request. Respondent-requested copies are direct opt-in mail
to that entered address, without separate confirmation, per Tejas's decision.
They include the respondent's own exact question/answer revision; private files
are names only. They are distinct from reviewed, non-sensitive chapter notices.

Migrations 093–097 are now applied locally and immutable. Use forward migrations.
