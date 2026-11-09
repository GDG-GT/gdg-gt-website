# Member points and cards

Admin: `/admin/rewards` (Super Admin only). Public board: `https://leaderboards.gdggt.dev/`. Member account: `https://leaderboards.gdggt.dev/member`. The main chapter website has no leaderboard or member page; `/leaderboard`, `/leaderboard/member` and `/member` return 404 there. The former subdomain paths redirect to its root and `/member`. Loopback previews retain `/leaderboard` and `/leaderboard/member`.

## Initial setup

Apply canonical migration 202611080142 once, then optionally run `scripts/data/reward-starters.sql`. Starter rules award nothing automatically. The three suggested perks remain unpublished with zero inventory. Set real inventory and conditions before publishing.

Only active, nondeleted, nonmerged directory members are eligible. Issuing a card creates a private rewards profile, not a public directory entry. Public aliases require the member to opt in after campus sign-in. Admins cannot silently publish a member on the leaderboard.

## Physical NFC cards

1. Find the member in Points & cards. Issue a labelled NFC card credential.
2. In the owned GDG Scanner iPhone app, choose Write blank NFC card and confirm. It refuses populated cards and reads the URL back before success. See the [iPhone scanner guide](IPHONE_SCANNER.md) for app installation, finished card purchase links and acceptance. Alternatively, write the generated HTTPS URL as the first NDEF URL record. Supported Android browsers can program blank NDEF cards from the page; an external writer must support NDEF URL records, not just copy UIDs.
3. Scan the card and verify the resolved member before handing it over. The displayed QR uses the same credential as this physical card.
4. On iPhone XS or later, tap the card near the top of an unlocked phone, open the OS notification, and use the signed-in Safari session. Installed PWA and Safari storage may differ. A URL handoff is not direct in-app NFC scanning.
5. Open Check-in scanner, choose an open activity, and start automatic check-in to award its points on each scan. Changing the activity or stopping the session disarms it. The manual reviewed-award flow remains available. Repeated scans cannot create a second award for that member/activity; an unknown result must retry the same check-in before scanning another member. Corrections require a reason; reversals append a compensating entry.
6. Revoke a lost card, then issue a replacement. Points remain attached to the directory member. A copied static card can identify the same member; the officer must verify who is present.

Keep cards private. Tags contain an opaque credential, not an email, name, account password or points balance. Credential hashes and authenticated encrypted copies are stored server-side. Never permanently lock tags automatically or overwrite a populated card without separate review.

## Points and perks

Rules determine points when an activity is created; later rule changes do not retroactively change that activity. Activities have a bounded time window. All awards, adjustments, reversals, card operations and claim decisions require current Super Admin access in the API and database transaction.

Perks use the current points threshold and do not spend points. A pending request reserves stock. Pending requests can be cancelled by the member or declined by a Super Admin. Approval and fulfilment recheck current eligibility and availability. Fulfilled and cancelled requests cannot be silently reopened. Travel consideration is a request for review, not guaranteed funding or selection.

Directory inactivation, removal, merge or email changes revoke credentials and member sessions. Merges involving existing reward or claim history are deliberately blocked for reconciliation; neither ledger is silently discarded or combined. Existing identity and history remain retained. This restriction is visible as REWARD_MERGE_REVIEW_REQUIRED.

Private screens show the latest 100 ledger/credential records; the immutable database ledger retains earlier entries. No offline points awards or private response caching. Camera permission is requested only when the officer chooses QR scanning. The document policy permits the same-origin camera across SPA entry routes, so entering from the homepage does not permanently block the scanner.

## Campus sign-in

IAM approval is still an external input. Configure a Supabase custom OIDC provider `custom:gatech`, with verified email and immutable subject, then set `GT_MEMBER_SSO_ENABLED=true` and `GT_MEMBER_SSO_PROVIDER=custom:gatech`. Register the exact callback(s):

- `https://leaderboards.gdggt.dev/api/v1/rewards/callback`

The GT application's provider callback itself is the Supabase callback displayed in its provider configuration. These are separate hops. Application PKCE verifier and browser binding are held in a short-lived encrypted server flow. The browser never supplies a member ID or arbitrary access token to sign in. No Google or password fallback is offered for member rewards.

Before enabling, test the real GT provider's verified email, subject, last-sign-in data, membership matching, return flow, rejection, sign-out and both browser/PWA storage contexts. A mock test does not establish institutional SSO acceptance.

## Apple Wallet QR and NFC

QR-only Wallet passes use `APPLE_WALLET_QR_ENABLED=true`, with `APPLE_WALLET_NFC_ENABLED=false`. Configure the Pass Type ID, Team ID, Apple-issued signing certificate, matching private key, optional key passphrase and the matching WWDR intermediate using the server-only `.env.example` fields. The server checks issuer identity, certificate/key matching, validity and the signing certificate's WWDR signature. QR does not require a contactless entitlement, VAS key or external reader. Officers scan the Wallet QR using the existing PWA camera scanner.

In **Member points & cards**, select an active community member, choose **Wallet pass QR**, give it a label and issue it. Issuance queues a branded email to the current directory email, with inline QR, downloadable PNG and Apple/Google Wallet buttons. Physical NFC registration queues the same delivery with the card reference ending in its last four characters. This is a credential reference, not a chip UID. Officers do not need to forward files.

Existing credentials have **Email card to member** and a delivery status. Provider acceptance is shown as sent; it is not proof that a recipient opened the email. The seven-day email fragment capability grants only access to that current credential and Wallet downloads, with no account sign-in or points authority. Revocation, inactive membership or a changed recipient invalidates it. The QR itself remains usable until revoked. The Apple/Google buttons open the private card page; Google remains disabled while issuer publishing approval is pending. New issuance has no standalone QR-fallback type. Legacy QR records remain recoverable.

Admin downloads require the existing Super Admin session and recheck the credential and active membership after signing. Issuing another credential still counts toward the five-active-credentials limit. Configuration creates no member or credential records. Apply migrations145–147 and deploy the matching worker before enabling the new delivery kind. Automatic email is an atomic outbox operation, not a browser send. It uses the existing per-minute delivery job.

Members can also download their own existing Wallet credentials after GT member sign-in is enabled. Passes contain the compact credential and a QR code, never an authoritative points balance. The website is the live balance source. Server revocation immediately prevents check-in; an already installed pass is not automatically removed or updated in Wallet. No Wallet push updates or self-service pass issuance are included. Test installation on a real iPhone, PWA camera scanning, duplicate check-in and revocation before treating device acceptance as complete.

NFC additionally needs Apple's enhanced/contactless approval, an ECDH P-256 VAS public key and a compatible reader. Set `APPLE_WALLET_NFC_ENABLED` and `APPLE_WALLET_READER_VERIFIED` only after that setup and real reader testing. A request for NFC with missing reader/key settings fails closed even when the QR flag is on. A paid Apple Developer account alone does not enable contactless passes.

The X100 is not verified for VAS, NDEF programming or SDK integration. No unknown desktop driver or copying utility was installed. Phone-to-phone Wallet tapping is not available from an iPhone PWA. The owned native scanner now includes an approval-gated Core NFC VAS path with server decryption and replay checks; it remains disabled pending issuer/reader approval and device acceptance. See ../planning/NFC_POINTS_RESEARCH.md for primary sources.

Domain configured and verified on 2026-11-08: Cloudflare DNS-only CNAME points to the existing Vercel project. The HTTPS root serves the leaderboard directly with status 200. Its member page is `/member`. The main website returns 404 for leaderboard/member pages.
