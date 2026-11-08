# Session-generation transport fence

The browser holds CSRF and a non-authorizing session-generation digest only in
module memory. Login/session/password responses return a domain-separated digest
of the opaque cookie. It is not the cookie, its database lookup hash, a user ID,
or an authentication credential; supplying it without a valid cookie grants no
access. No new storage, public identity endpoint, or account permission is added.

Private requests send `X-Session-Binding`. Central session validation rejects a
supplied mismatched/malformed binding with 409 `SESSION_CHANGED` before private
reads or writes. This catches another tab replacing the cookie, even for another
session of the same account. Older non-browser clients may omit this correlation
header but still require their own valid session, CSRF and action authorization.
It is a stale-intent fence, not a substitute for authorization.

The browser initializes the binding before protected writes. A CSRF-invalid
pre-mutation response permits exactly one refresh/retry with the same original
body/idempotency key, but only in the same session generation. A different binding
or an explicit server mismatch clears private state and never retries old intent.
Explicit login/session clear cancels pending private fetches and advances an
in-memory epoch; late refresh, error and decoded-data results cannot overwrite a
new session. Password rotation invalidates other pending results and adopts the
new generation for its successful operation. A public Form-access 401 does not
clear an unrelated admin session; public response fields cannot supply CSRF.
The authentication provider also clears private identity/team state on session
clear, alongside existing editor/Realtime/navigation listeners.

Cancellation does not undo a write already accepted by the server. Existing
transactional current-session/permission checks, revision fences, idempotency and
audit remain essential. Other tabs detect replacement on their next private HTTP
request; this change does not claim instantaneous cross-tab broadcast or complete
Realtime/hosted race certification.

Verification: **252 unit tests** pass, including 12 transport race/cancellation
cases and two additional central-auth binding cases. **Six real loopback HTTP
checks** (`../phase0/local-session-generation.json`) use two independent sessions
and verify stale private read/logout rejection without revoking the replacement.
Only those test sessions are logged out. The original auth HTTP regression and
private editor smoke test are also rerun. Browser proof of successful new-record
creation and password-confirmed recoverable archival after transport hardening is
in `../ui-review/real-session-bound-{save,archive}.png`; no officer account created.
TypeScript, UI/scoped lint and build pass (existing Fast Refresh warning and large
bundle warnings remain). Full PRD/security/accessibility acceptance stays open.
