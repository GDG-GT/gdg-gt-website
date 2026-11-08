# Member points and cards

Admin: `/admin/rewards` (Super Admin only). Public board: `/leaderboard` on the chapter domain and on `leaderboards.gdggt.dev`. The subdomain root redirects to `/leaderboard` before rendering the homepage.

## Initial setup

Apply canonical migration 202611080142 once, then optionally run `scripts/data/reward-starters.sql`. Starter rules award nothing automatically. The three suggested perks remain unpublished with zero inventory. Set real inventory and conditions before publishing.

Only active, nondeleted, nonmerged directory members are eligible. Issuing a card creates a private rewards profile, not a public directory entry. Public aliases require the member to opt in after campus sign-in. Admins cannot silently publish a member on the leaderboard.

## Physical NFC cards

1. Find the member in Points & cards. Issue a labelled NFC card credential.
2. Write the generated HTTPS URL as the first NDEF URL record. Supported Android browsers can program blank NDEF cards from the page; an external writer must support NDEF URL records, not just copy UIDs.
3. Scan the card and verify the resolved member before handing it over. The displayed QR uses the same credential as this physical card.
4. On iPhone XS or later, tap the card near the top of an unlocked phone, open the OS notification, and use the signed-in Safari session. Installed PWA and Safari storage may differ. A URL handoff is not direct in-app NFC scanning.
5. Choose an open activity and confirm the award. Repeated taps cannot create a second award for that member/activity. Corrections require a reason; reversals append a compensating entry.
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
- `https://gdggt.dev/api/v1/rewards/callback`

The GT application's provider callback itself is the Supabase callback displayed in its provider configuration. These are separate hops. Application PKCE verifier and browser binding are held in a short-lived encrypted server flow. The browser never supplies a member ID or arbitrary access token to sign in. No Google or password fallback is offered for member rewards.

Before enabling, test the real GT provider's verified email, subject, last-sign-in data, membership matching, return flow, rejection, sign-out and both browser/PWA storage contexts. A mock test does not establish institutional SSO acceptance.

## Apple Wallet NFC

The server generator is implemented, but issuance remains unavailable until all issuer settings and NFC reader verification are present. Use the `.env.example` APPLE_WALLET_* fields. Pass signing certificate/key and WWDR certificate remain server-only; confirm Pass Type ID, Team ID, key pair and expiry. NFC needs the enhanced entitlement and an ECDH P-256 VAS public key. A paid Apple Developer account alone does not enable contactless passes.

Set both `APPLE_WALLET_NFC_ENABLED` and `APPLE_WALLET_READER_VERIFIED` only after real Apple pass acceptance and reader testing. Super Admins can then issue Wallet credentials linked to the same member account. Members download their own signed .pkpass after GT sign-in. Passes contain the compact credential and a QR fallback, never an authoritative points balance. The website is the live balance source. Server revocation is immediate; Wallet UI does not receive automatic push updates in this release.

The X100 is not verified for VAS, NDEF programming or SDK integration. No unknown desktop driver or copying utility was installed. Phone-to-phone Wallet tapping is not available from an iPhone PWA; it requires native ProximityReader/approved reader integration. See NFC_POINTS_RESEARCH.md for primary sources.

Domain configured and verified on 2026-11-08: Cloudflare DNS-only CNAME points to the existing Vercel project. HTTPS root redirects to `/leaderboard`; the page and public rewards API return 200.
