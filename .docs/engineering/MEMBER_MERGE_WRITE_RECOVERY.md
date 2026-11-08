# Member merge review and commit recovery

Local verification on 2026-11-06, after contact recovery commit `ced1c74`.
Migration 135 is applied and immutable. Both full SQL chains pass (244/245 checks),
both 100-client capacity races and six isolated restore checks pass.

Preview/commit wrappers preserve existing five-minute review, source/target
revision, project/profile-link, same-owning-scope, exact-reference and fresh-proof
rules. Current account/session and both source/target permissions precede receipt/
hash disclosure. Preview receipts store only review ID; authorized inspection
reconstructs current comparison only while the same unused review and revisions
remain valid. Its deterministic capability is restored at the server after current
inspection and never persisted in plaintext. Commit receipts retain only canonical
ID/revision/source ID, allow accepted outcome inspection without retained password,
preserve newer canonical edits on accepted replay and refuse new stale operations.
Receipts are bounded by session and existing 48-hour idempotency expiry.

Unknown preview/commit UI requests freeze original source/target/review/document/
key in memory, block replacement changes and navigation, explicitly inspect before
identical retry and require fresh commit proof. Offline/unmount abort ignores late
acknowledgement; reconnect/second loss requires another check. Current denial clears
the entire parent private directory/review, not merely candidate controls. Stopping
clears proposals, leaves outcome unconfirmed and requires current selection recheck.
No automatic retry/undo/erasure claim. The 47-hour client window fences expired
receipts. Malformed/mismatched/expired review and commit acknowledgements are refused.

All 64 combined focused merge read/write/server cases pass (15 new write cases and
six new inspection-route cases). The five-file directory/ordinary/merge/server run
passed 104 before the additional nullable-field regression; all 64 scoped cases
pass after it. All 54 combined production-browser cases pass across six profiles;
all 36 final nullable-member write cases also pass across six profiles after a
fresh production build.
Native final probe passes 53 actual local API/DB/UI checks at desktop/mobile:
preview/commit before/after loss, read-only unchanged rows, original password-free
body/key, explicit fresh-proof retries, one audit outcome, ten simultaneous same-key
previews and commits, later canonical preservation and current role loss. Populated
axe/overflow pass, mobile review capture inspected, unapproved.

Initial owned fixture failures are retained: native option visibility assertion,
then exact implicit-label lookup (both before any review/mutation); both corrected
to attachment/combobox lookup. A third probe reached an accepted preview but the
client correctly-shaped boundary was too narrow for legitimate legacy null phone/
year/major. Those fields now accept null, with a focused regression. All initial
fixtures cleaned up their owned members/account/sessions; that third unused review
remains private under ordinary expiry. No completed fixture effects are repeated.
Final owned members archived, actor disabled/sessions revoked; private reviews,
audit and tombstones retained, no physical-erasure claim. No real chapter/provider/
production actions. See `../phase0/local-member-merge-recovery.json` and initial reports.

All 105 combined directory/ordinary/merge read-write/server cases pass after the
nullable fix. All 2,612 tests/209 files and all 21 critical branch gates pass.
Global lines/branches/statements pass at 74.01%/73.63%/72.31%; functions still fail
the unchanged 70% gate at 65.44%. Build/types/lint (zero errors/25 existing warnings),
budgets/secrets/traceability pass. Catalog: 160 unverified logical cases.
`../phase0/member-merge-quality.json`.
Person-data privacy review/commit recovery and complete role/manual/device/visual/
hosted acceptance remain. SSO/Google and Bevy/Engage stay deferred. No deployment,
purchases, real provider sends, production changes, timer or AI trailer.
