# Contact status and retention-hold write recovery

Local verification on 2026-11-06. Migration 134 is applied after both SQL chains
passed (242/243 checks), both 100-client capacity races and six isolated restore
checks. Applied migration 134 is immutable; corrections need a forward migration.

Current session/contact permission and a non-redacted record precede receipt/hash
lookup. Ordinary status/hold writes require explicit original keys and use an
atomic wrapper around the existing revision/proof/retention mutation. Receipts
contain only ID/revision/action, bound to actor/session/contact/body/key under the
existing 48-hour expiry. Ten simultaneous identical requests commit one transition.
An old accepted status returns its receipt without overwriting a newer save; a
new stale request conflicts. Current role loss, session revocation, redaction and
expiry deny recovery. Hold changes still require current password proof; read-only
accepted inspection needs no retained password. Strict inspection rejects supplied
proof, wrong confirmation and incomplete hold consequences.

The inquiry UI preserves unknown original action/revision/document/key only in
memory, freezes fields/navigation/downloads, explicitly inspects before identical
retry, requires fresh hold proof and rechecks after second loss/reconnect. A safe
47-hour client window prevents recreating expired receipts. In-flight offline or
unmount cancellation ignores late acknowledgement. Current denial/session change
clears private state. Reviewed stopping clears proposed fields and requires loading
the current saved inquiry before a replacement change; it cannot imply undo or a
confirmed outcome. Contradictory current/receipt revisions, wrong source/action
and malformed acknowledgements are refused. Existing inbox read/attachment
recovery remains covered; the legacy contact-file fixture now supplies explicit
keys for its inbox mutations, with no fixture effects repeated.

All 62 combined focused server/client/schema/read-recovery checks pass (24 new
client and nine new route cases). The initial combined production-browser run
passed all 60 read/write cases across six profiles. The stricter-receipt run
passed 35/36; one Chromium startup displayed an empty page before inquiry load,
with no causal diagnostic. That failure is retained in
`../phase0/contact-write-browser-startup-failure.json`. A full diagnostic rerun with
unchanged gates/timeouts and failure traces passed all 36 write cases; the blank
startup did not reproduce and its cause is not claimed resolved.
`../phase0/contact-write-read-browser.json`, `../phase0/contact-write-final-browser.json`.
Populated automated axe/overflow pass. Desktop/mobile native hold captures were
created and the mobile capture inspected; screenshots are unapproved candidates,
not golden baselines or real Safari/device acceptance.

All 65 actual local API/DB/native desktop-mobile checks pass, including status,
applying/releasing holds before and after accepted reply loss, unchanged rows
during inspection, exact password-free original body/key, fresh explicit proof,
ten concurrent identical requests, old accepted replay, new stale conflict and
current access loss. No egress/page errors/overflow/providers/workers/files or real
chapter changes. Owned inquiry identity/content redacted, owned actor disabled and
sessions revoked; private tombstones/audit remain, no physical-erasure claim.
`../phase0/local-contact-write-recovery.json`.

All 2,591 tests/208 files and all 21 critical 90% branch gates pass. Global
lines/branches/statements pass at 73.78%/73.46%/72.10%; functions remain below
the unchanged 70% gate at 65.25%. Build/types/lint (zero errors/25 existing
warnings), budgets/secrets/traceability pass. Catalog: 160 unverified cases.
`../phase0/contact-write-quality.json`.
Merge preview/commit and person-data privacy review/commit recovery remain, along
with global function coverage and complete role/manual/device/visual/hosted PRD
acceptance. SSO/Google and Bevy/Engage stay deferred. No deployment, real provider
sends, production changes, purchases, new timer or AI commit trailer.
