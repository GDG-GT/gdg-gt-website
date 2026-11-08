# Contact interface recovery and focus

Implemented locally on 2026-10-26 against PRD 22.9/28.3. Contact captures its
complete body before disabling controls, blocks duplicate in-flight submits and
retains the same idempotency key for unchanged retries. Attachment preparation
must finish before the contact POST. An ambiguous failure can reuse the same
in-memory upload and approved proof rather than creating another object.

The client retains only known server validation fields, groups nested attachment/
interest errors onto their real control and associates visible error text with
`aria-invalid`/`aria-describedby`. It focuses the first invalid control; correcting
one field clears only its error. Generic failure focuses the alert; committed
success focuses its heading. Interest count/length and nonempty allowed file
type/10-MiB maximum are checked before uploading. File removal returns focus to
the selection control. Write another message clears the form and focuses its
heading. Inline errors use plain text with a separate concise summary.

Only supported inquiry URL types preselect the control; unknown values recover
to General. A changed inquiry context mounts a fresh form after the existing
Stay/Discard safeguard. The old operation is aborted, its in-memory draft is not
carried over and its late result cannot confirm another inquiry. Busy operations
retain the shared navigation protection; the isolated late-response DOM test
deliberately omits that guard to prove the cleanup independently.

Twelve DOM cases were added, exercising the real Contact service with injected
transport and the existing navigation guard. All 716 tests/115 files pass;
strict types pass; lint remains 0 errors/25 warnings. Coverage is 31.66% lines/
30.21% branches, below the required 70%; all 17 critical-file branch gates pass.
Thirty actual private-contact checks also pass with local signed object storage,
ClamAV, SMTP capture, inbox permissions, idempotency and scoped retention.
See `../phase0/local-contact-files.json`.

Native Chrome verified the associated interests-error focus, one successful
fictional contact commit, success-heading focus and fresh-form heading focus.
The exact fictional record was then marked Resolved through the audited protected
API. No unrelated inquiry changed and no real provider mail was enabled. Browser
evidence is `../phase0/contact-browser-interactions.json` and screenshots
`../ui-review/contact-validation-focus.png` / `../ui-review/contact-committed-success.png`.
The 375px page remains scrollable with no horizontal overflow. These checks do not
approve real chapter copy, full screen-reader/device accessibility, production
sender configuration, deliverability or hosted retention/security acceptance.
