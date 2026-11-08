# Community member import/export and inbox clearing

Implemented locally on 2026-10-21 for Tejas's additional requests. These additions
do not replace the remaining original PRD or certify production readiness.

## Community directory

Open `/admin/members` → Import CSV or Export CSV. This is the private community
directory, not officer accounts, team access memberships or public biographies.

Import accepts a UTF-8 CSV file or pasted CSV with `name` and `email` headers.
Download the template for optional phone/year/major/category/interests/state/core
and section fields. Quoted commas, escaped quotes, embedded newlines and UTF-8
BOM are supported. Interests use a JSON array in one quoted CSV cell. Boolean
columns accept true/false, yes/no or 1/0. Limits: 1 MiB and 200 member rows per
batch. Unknown/duplicate headers, malformed CSV, invalid fields and repeated
normalized emails must be corrected before review. Exported ID/team/revision
columns are explicitly ignored; the selected destination governs every new row.

Review import validates current read/create permission in that destination and
returns counts and source-row ordinals, never details of an existing match in
another scope. Existing normalized emails, including archived/merged/unavailable
records, are skipped. The preview expires after five minutes and belongs to that
account and sign-in session. Changing the source or destination requires another
review. Confirmation is `IMPORT <eligible count>` plus the current password.

The new rows commit atomically under the same community/account locks as ordinary
member editing. Changed duplicate availability causes a conflict and fresh review,
not silent partial import. Idempotent retry returns the same created IDs. No
existing record is updated, restored, merged or deleted; no login account, grant,
invitation, newsletter subscription or public profile is created. Source contacts
and plaintext review tokens are not retained in review rows or audit metadata.
CSV contents and review tokens remain in UI memory only and clear on discard,
completion, navigation/unmount or session clearing. In-app navigation confirmation
preserves the text when Stay here is chosen.

Export uses the current directory filters across all matching result pages and
rechecks account, session and per-team read rights. It is limited to 1,000 rows
and a bounded API response. By default, email, phone, academic fields and interests
are absent. Include private fields is an explicit choice, never extra authority.
Spreadsheet formula-leading values are apostrophe-escaped. Exported CSV is a
report, not an exact round-trip representation of formula-prefixed source text;
use the template when preparing new records. Downloaded private copies cannot be
recalled. Exports are audited with counts/flags/hashed filters, not raw contacts.

## Notifications

Unread items: Mark all read. Once unread count reaches zero and items remain,
the same button becomes Dismiss all. Bulk dismissal removes only the signed-in
account's read notifications across all pages. A newly arrived unread item is
preserved, even if it arrived between the read and dismiss requests. Empty retries
are safe, cross-account mutations stay concealed, and affected counts are audited.
Unknown legacy read flags were normalized to unread and the column is now
non-null, preventing a discrepancy between displayed state and unread counts.

## Evidence

- Migrations 067–069 and canonical SQL tests, including independent team and
  session boundaries, changed source/snapshot, atomic rollback and own-inbox-only
  dismissal. Applied migrations are immutable; fixes require forward migrations.
- Seven CSV unit checks; `npm run test:local-member-transfer`: 22 actual API/DB
  checks with invocation-owned fictional accounts/teams/records; those records
  are archived and fixture accounts/teams deactivated by the harness.
- `npm run test:local-notification-bulk`: seven actual API/DB checks using separate
  fictional inboxes, including an unread arrival after read-all.
- Browser: file-independent paste → validation → server review, Stay here retains
  text, Discard and leave closes only the fictional pending import. Real filtered
  CSV download reached Chrome's Done state (211 B). No private-field export or
  browser sample import was submitted, and Tejas's existing inbox was not cleared.
- `../ui-review/real-member-import-*.png` and `real-member-export-desktop.png`.
  Mobile width was 375 px with no document overflow and real dialog scrolling.
  Native file-picker selection is not claimed as verified by this browser pass.

Hosted role-matrix, accessibility, provider and visual acceptance still require
their own release checks. No external mail, deployment or real member import was
performed.
