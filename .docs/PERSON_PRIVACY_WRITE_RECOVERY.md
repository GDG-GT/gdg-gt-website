# Person-data privacy original review and approval recovery

Local verification on 2026-11-06, after merge commit `dc205f2`.
Applied migrations 136/137 are immutable. Both final SQL chains pass (247/248
checks), both 100-client capacity races and six isolated restore checks pass.

Atomic original review/approval and password-free current-session inspection
preserve exact scope/identity attestation/purpose/sensitive/history IDs, current
Super Admin/session/password, five-minute review, fingerprint/hold checks and
single-use exports. Review receipts store only review ID; inspection reconstructs
only the original live, unused, unchanged review with current proof generation.
Its capability is derived at the server from session/key and never persisted in
plaintext. Approval receipts store summary only; accepted export inspection/replay
never returns private bytes. Current authority precedes original hash/receipt
lookup. Fresh mutations independently retain original fingerprint/hold/proof checks
and their precise refusal codes. Forward 137 adds current fingerprint retry
eligibility; applied 136 was not edited. Existing protected review retention and
single-use exports remain; no raw private data/proof/capability in new receipts.

Unknown UI requests preserve normalized original scope/review/count/action/key
only in memory, freeze fields/navigation/downloads and explicitly inspect before
an identical freshly proven retry. Second loss/reconnect clears eligibility,
offline/unmount cancellation ignores late receipts, session/current denial clears
private state and a conservative 47-hour window fences expired receipts. Reviewed
stopping clears proposals without claiming undo or physical erasure. Malformed
record/count/action and private-byte inspection replies are refused. A successful
new export prepares an explicit memory-only download link and never auto-clicks
it. Raw export data is not retained in ordinary React state or persistence.
Clear/change/context/logout/unmount/offline revokes the object URL. Accepted lost
export confirms preparation, not download, and cannot reconstruct private bytes.

All 54 focused read/write/route/schema checks pass, including 15 new UI and seven
new route cases. All 66 production-browser read/write cases pass across six
profiles, no skips, with populated axe/overflow checks and explicit native download/
clear. All 50 final actual local API/DB/UI checks pass at desktop/mobile: review/
redaction before/after reply loss, read-only unchanged source, exact password-free
body/key, fresh explicit retry, accepted-lost export metadata, explicit download/
clear and current Super Admin loss. Ten scope reviews maximum under existing quota;
no quota resets/bypass. Native mobile review capture inspected, unapproved.
`phase0/person-privacy-read-write-browser.json`,
`phase0/local-person-privacy-recovery.json`.

Initial native probe passed 47 core assertions, then its direct final inspection
reused CSRF from before later browser session bootstraps rotated it. The fixture
now refreshes CSRF immediately before that probe; final full 50 pass. Initial and
final cleanup verified: owned contacts redacted, officer disabled/sessions revoked.
Unused reviews expire privately under ordinary rules; no protected review update,
provider/worker/production/real chapter effects or physical-erasure claim.
`phase0/person-privacy-native-csrf-fixture.json`.

The initial full run passed 2,633 assertions and hit one five-second architecture
scan timeout. The scanner already parsed shipped sources, but the security test
then reread/reparsed them all. It now receives each existing shipped AST once;
HTML/static/lazy/offline coverage and rules/timeouts/gates are unchanged. A new
isolated import-graph contract verifies exact-once callbacks, inclusion of lazy/
offline roots and exclusion of non-shipped test/user work. All 60 combined focused
checks pass. Build/types/lint (zero errors/25 existing warnings), budgets/secrets/
traceability pass. The final full-suite rerun passes all 2,635 tests/210 files and
all 21 critical branch gates; the privacy route itself has 100% branch coverage.
`phase0/person-privacy-write-quality.json`. Final measured coverage: lines/branches/statements pass 74.25%/73.89%/72.54%;
functions still fail unchanged 70% at 65.65%. Catalog: 160 unverified logical cases.

Known member/merge/contact/privacy recovery feature gaps now have local code and
behavior evidence; a fresh final audit, function coverage and complete role/manual/
device/visual/performance/PWA/hosted/institutional acceptance remain. SSO/Google and
Bevy/Engage stay deferred. No deployment, purchases, real provider sends, production
changes, timer or AI trailer. Preserve unrelated user files.
