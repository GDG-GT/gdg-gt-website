# Public queue recovery checkpoint (local)

The IndexedDB queue now recovers a stopped tab/worker's exhausted final attempt.
It leaves an active lease alone. Once that final lease ends, a read or replay
marks the record failed, removes its private payload and explains that the server
result could not be confirmed. It does not start a ninth request. An interrupted
earlier attempt can still replay with its original idempotency key; a superseded
lease cannot overwrite a newer result. Expiry copy distinguishes this device's
record from the server result and tells the user to check before submitting again.

The shared queue UI no longer calls storage empty before reading it. Failed reads
offer an explicit read-only retry; a failed refresh labels the last successful
snapshot and disables its mutation controls. Request ordering prevents an older
read from restoring a stale row. Retry is unavailable offline or during a live
lease. Save freezes consent/email and rejects duplicate submissions synchronously.
Write errors preserve the input; committed saves clear it. Feedback receives focus
after save/retry/discard, without depending on animation frames. Failed newsletter
records now have original-page recovery too. Reading storage never replays writes.

The online-accessible `/offline` help route no longer falsely says the user is
offline. Actual connection loss is reported by the queue's connection listener.
The separate production offline entry continues to share this queue component.
Forms are not added to the background queue, and this change does not cache data.

Twelve queue-engine cases include four added interruption/context cases. Fourteen
DOM/lifecycle cases cover loading, failed/stale reads, ordering, focus, consent,
pending writes, duplicate prevention, offline/lease controls, replay triggers and
logout-clear failure pausing. These use controlled storage/network doubles; they
do not certify real worker termination or platform storage failure handling.

Actual Chrome testing used only `fictional-queue-recovery-20261026@example.test`.
The UI saved it to real IndexedDB, reported actual API acceptance and retained that
status after reload. Direct local database verification found exactly one pending,
inactive, unconfirmed subscriber. Email remains restricted to loopback SMTP
capture; no real provider or notification permission was enabled. The
identifier-only accepted device record and synthetic subscriber remain for review.
The 375 px DOM check has no horizontal overflow and a 44 px action height; the
temporary viewport was reset. See `phase0/queue-recovery-browser-observations.json`
and `ui-review/queue-storage-recovery.png`.

Real multi-tab/worker termination, lost-response capacity races, browser private
mode/storage quota failure, exact 48-hour browser expiry, supported-device offline
install/update/cache inspection and manual screen-reader acceptance remain open.
The complete PRD and global coverage gate are not closed by this checkpoint.
