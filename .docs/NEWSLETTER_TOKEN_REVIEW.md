# Newsletter preference review

Implemented locally on 2026-10-26 against PRD 22.12. The previous browser page
automatically consumed its capability during mounting. Opening it now performs
only a read-only review and presents an explicit Confirm subscription or
Unsubscribe button. The final mutation is a distinct POST action. A link scanner
or browser preload cannot activate/opt out just by rendering the page.

Private tokens remain in component memory, are stripped from the visible URL
after capture, and are sent only in same-origin POST bodies. The former
module-level token/promise cache was removed. Validation endpoints are POSTs
because the private capability must not enter API query strings; their database
function is stable/read-only and returns only valid/applied booleans, never
subscriber identity. Responses are no-store and rate-limited; browser database
roles receive no function grant.

Migration 108 makes a repeated committed confirmation return safe success while
the same subscription is still active, consented and not suppressed/deleted or
team-disabled. A confirmation cannot reactivate an opt-out. Unknown, expired,
wrong-purpose and missing-consent tokens fail closed. Unsubscribe remains safely
idempotent. The original SQL test was updated to assert safe confirmation replay;
the new SQL suite separately proves replay cannot reactivate a later opt-out.

The UI distinguishes loading, ready, submitting, applied, invalid, preview and
recoverable failures. It blocks duplicate actions and guards pending navigation.
Success appears only after commit or a read-only already-applied result. Ambiguous
mutation failures say the change may have completed and offer safe retry, rather
than claiming preferences are unchanged. Completion/retry focuses the heading.
Changed capability contexts abort old work and cannot inherit its confirmation.

Seventeen DOM/API cases were added. All 743 tests/118 files pass, strict types
pass and lint is 0 errors/25 warnings. Global coverage remains below 70% at
32.12% lines/30.80% branches; all 17 critical branch gates pass. Clean and legacy
grant SQL suites pass through 108, as do both 100-client capacity races and six
isolated backup/restore checks. Thirty-five actual newsletter/SMTP/callback/
campaign checks and nine repeatable isolated token-review checks pass. See
`phase0/local-newsletter.json` and `phase0/local-newsletter-review.json`.
The existing public-submissions compatibility suite also passes with the safe
confirmation-replay contract; its separate fictional subscription/contact records
remain retained as documented in `phase0/local-public-submissions.json`.

Native Chrome opened each fictional review without its action and the held
fixture suite checked PostgreSQL: confirmation stayed pending, unsubscribe stayed
active. Explicit clicks then committed and focused the success headings. See
`phase0/newsletter-token-browser-observations.json` and its referenced screenshots.
The exact fixture tokens were revoked, subscriber archived and ignored mode-0600
ledger removed. No real recipient or provider was used by this browser fixture.

Use `npm run test:local-newsletter-review` for isolated HTTP proof; the optional
`--hold-for-browser` mode writes a separate browser evidence file and privately
holds its exact fixture through the four review/action phases. Do not expose the
temporary ledger or tokens. Closing the interactive input fails and runs cleanup.

Migration 108 is applied locally and immutable. The additive inspector can remain
with older server code, but rolling back to the former auto-consuming browser
would reintroduce the PRD defect. Retain the reviewed UI/API pair or use the safe
maintenance flow during rollback. Changes to SQL require a new forward migration
and must preserve stored consent, opt-outs, token purposes and expiry. Hosted
sender/link-scanner compatibility, full supported-device/screen-reader review and
production acceptance remain open.
