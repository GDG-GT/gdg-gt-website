# Account changes and reviewed recovery — November 5, 2026

Forward migration 113 adds service-only, actor-bound atomic retry receipts to
account creation, updates and security actions. Every attempt/replay checks the
current account/session, current verified password hash and current target-role
hierarchy. Changed intent conflicts; a result promoted beyond the actor's current
authority is concealed. Receipt fingerprints exclude password proof and random
setup-token/encryption material; stored results contain only the safe account
summary. Creation/reset replay cannot issue a second capability, job or audit.
The API requires an explicit retry identity and all active/local callers use it.

The new SQL tests exposed an existing double revision increment: the semantic
account UPDATE triggered the revision guard, then the final account UPDATE added
another step. A forward replacement now finishes at one step beyond the locked
original revision. Existing prepared/applied migration history is unchanged.
All 113 migrations and complete SQL tests pass under clean and legacy automatic
grants (201/202 checks), including both independent 100-client races. Six isolated
backup/restore checks pass. Only the dedicated local stack was migrated.

Account editing/security now reads the selected record independently before a
write. New saved revisions retain draft fields and require review before loading
current values; loading clears entered password and typed confirmation. Creation
and edits review the exact recipient/name/role and setup/session consequence.
Existing security action reviews keep their exact typed email and own-password
requirement. Current revisions/actions invalidate stale approval. Internal
cancellation reviews discarded input; Escape/outside closing freezes while
pending. Modal closing restores its opener, receipt or stable workspace landmark.

A scoped synchronous latch freezes pending input and prevents duplicate writes;
account/role/session/unmount replacement cancels/fences old requests and receipts.
Denial clears private rows, fields, credentials and review intent. Wrong password
confirmation is field feedback and retains the account draft; actual access
denial still clears it. Ambiguous saves retain only exact password-free intent
and retry key, require a read-only recheck, then fresh current-password proof for
an explicit identical replay. A 47-hour client cutoff precedes 48-hour server
receipt cleanup. Abandoning recovery reviews that the operation may already have
completed and does not reverse saved records. Reconnect sends no write.

All 50 focused client/route cases pass, including 19 new mutation cases and two
new route identity/fingerprint cases. All 28 actual loopback API/DB and desktop/
mobile Chromium checks pass. Ten simultaneous identical creates produce one
account/capability/job/audit; repeated reset queues one setup link; accepted-but-
lost browser updates replay with one revision/audit and fresh password proof.
Real selected-record conflicts retain fields until reviewed read-only loading.
Populated consequence-review axe checks pass. Fresh fictional setup/reset jobs
were marked dead with encrypted secrets cleared, capabilities revoked, accounts
disabled and sessions revoked. A preflight refuses a running sender/scheduler.
No worker/provider send or existing account/session change occurred.
Evidence: `../phase0/local-user-mutation-recovery.json`.

All 1,364 tests/156 files pass after the added submitter-focus regression case.
Global coverage at this full-tree checkpoint (including in-progress Teams read
source) still fails 70%: 61.72% lines, 60.73% branches, 60.10% statements and 52.99%
functions. All 17 individual critical
branch gates pass. The catalog contains 150 unverified logical acceptance cases.
Types/lint (zero errors/25 warnings), build/budgets and traceability pass. The
first production browser run exposed WebKit returning focus to the password
field because clicking Save does not focus that button there. Reviews now retain
the actual form submitter. Both live development WebKit checks and all 48 final
production-build account/shared-workspace checks pass across six pinned profiles.
Evidence: `../phase0/account-recovery-workspace-browser.json`. Fixture receipts test
client behavior only; real SQL/HTTP proof is recorded separately above. Captures
remain unapproved candidates.

Full account-action/role/device/manual assistive-technology/zoom, approved visual,
hosted delivery/load/retention and operational acceptance remain open. The full
PRD is not complete; local and fixture evidence do not approve deployment.
