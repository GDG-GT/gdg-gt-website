# Contact-inbox private read recovery

Local verification on 2026-11-06. No full PRD, approved-visual, manual/device or
hosted acceptance is claimed. Applied database chain remains 132; no migration
was needed for this read checkpoint.

`ContactInbox.tsx` replaces combined response/error state with a keyed private
read, retains dated same-view snapshots and local status/hold proposals through
transient read failure, and permits selected inquiry refresh/retry. Current denial
clears private state and requires explicit refresh; account/role/session contexts
remount and cancel old work. Empty/mismatched selected replies cannot dereference
`items[0]`. Offline/reconnected actions stay paused until explicit current read.
A changed revision preserves the old proposal but pauses actions and requires
reviewed current-record reload. Current redaction metadata remounts the review
immediately, clearing prior private content/proof.

Activated attachment links clear as soon as the inquiry is paused/stale and on
expiry/context/session loss. Late old authorization results cannot restore a
cleared link. Attachment authorization denial clears the private parent. Inquiry
tables are named keyboard-focusable scrolling regions. Existing status/hold
backend rules are preserved; original-outcome mutation replay is separate pending
work and must not be claimed complete by this read module.

All 44 focused inbox/public-contact/server cases pass, including 26 new inbox
behavior checks. Malformed inquiry replies cannot render partial private data;
unsafe or late/expired download replies are refused using the existing Forms
private-download validator, including supported loopback storage. The initial
browser matrix had 12 passing cases and 12 status-control lookup failures; the
exact label lookup did not resolve the control despite its accessible combobox
name. The role/name lookup passed four targeted cases and the next full matrix
passed all 24 cases. Both reports are retained. The final validator build also
passes all 24 cases across six profiles, no skips. Populated axe/overflow passes;
mobile native capture inspected. No approved golden or real-device claim.
`../phase0/contact-inbox-final-browser.json`.

All 14 actual local API/DB/native desktop-mobile checks pass. Initial selected
retry, retained proposal, explicit reviewed current revision, private redaction,
axe and no native writes/egress/errors/overflow are verified. Deliberate changes
are restricted to invocation-owned fixture records. Fixture inquiry content is
redacted, actor disabled and sessions revoked; tombstones/audit remain private,
with no physical-erasure claim. `../phase0/local-contact-inbox-reads.json`.

Strict types, build, lint (zero errors/25 existing warnings) and byte budgets pass.
No migration is needed, and no providers/workers/external effects were enabled.
Current/history secrets and traceability pass. All 2,517 tests/204 files pass;
all 21 critical 90% branch gates pass. Global coverage passes lines (72.91%),
branches (72.81%) and statements (71.29%); functions still fail the unchanged
70% gate at 64.39%. The catalog remains 159 unverified logical cases.
`../phase0/contact-inbox-read-quality.json`.

Continue ordinary member/merge mutation recovery, contact status/hold unknown
outcomes, person-data privacy, global function coverage and complete manual/
device/visual/hosted acceptance.

Local only. Preserve unrelated user files. SSO/Google and Bevy/Engage remain
deferred. No deployment, purchase, real provider send, production change, another
timer or AI commit trailer.
