# Forms interface recovery and section focus

Implemented locally on 2026-10-26 against PRD 22.11/28.3. Identity/answer errors
now queue semantic focus after React commits and controls are enabled, without
animation frames. Section changes focus their heading, including Back to the
first section. Server answer errors return to the applicable earlier section;
generic submit failures focus their summary. Save/verification feedback and
private-link copy failure remain visible/focused, including after submission.
Unmount aborts pending submit/save/verification transport and ignores late results.

Initial loading has a named skeleton/status. Recoverable read failures and rate
limits offer retry; focus remains on the content landmark. Concealed 404s use the
same branded content as other missing routes without importing the complete
public-page bundle. Form metadata is explicitly noindex/nofollow/noarchive and
uses a generic unavailable title when no form may be shown.

Review preserves the existing string-based numeric contract, including "0".
Cleared choices/empty answers are labelled Not answered; matrix answers use
readable row/choice lines instead of raw JSON. Private files show only known
filenames or Private attachment, never object/capability IDs or download URLs.
An offline notice says exactly what survives: answers in the current open tab.
Final submit and server draft save stay disabled offline, and reconnect never
automatically writes. No private answers/capabilities are persisted to browser
storage or added to the offline submission queue.

Eleven DOM/privacy cases were added, including paused frames, previous-section
errors, retry, branded concealment, offline/reconnect, review formatting and
late-response cancellation. All 754 tests/118 files pass; strict types pass;
lint is 0 errors/25 warnings. Build and public byte budgets pass. Coverage remains
below 70%, at 32.37% lines/31.09% branches; all 17 critical branch gates pass.

Nine actual local HTTP/immutable-schema runtime checks pass. Native Chrome
keyboard entry completed the segmented local date/time and a zero estimate,
review focused its heading, Back focused the first section, and a final fictional
response committed with success-heading focus. A direct read verified complete
status and the string-zero answer. The automation tool's datetime fill did not
commit its value; native entry worked, so no date-input workaround was added.
The separate unfinished automation draft was discarded, exact form/account
archived and synthetic committed responses retained. Public reads now return 404.
See `phase0/form-recovery-browser-observations.json`,
`phase0/local-form-runtime.json` and `ui-review/form-first-section-focus.png`.

These observations do not close full supported-device/screen-reader coverage,
private-access/offline reload acceptance, official copy, hosted provider/storage
or visual/launch approval. No database migration was required by this batch.
