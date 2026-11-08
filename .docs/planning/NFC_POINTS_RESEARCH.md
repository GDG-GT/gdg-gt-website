# Member cards, points and rewards

Initial research began 2026-11-08 17:00:08 UTC. Scope: existing PWA, iPhone first, Android supported, one member identity, super-admin controlled awards. Rewards, event integration and QR Wallet signing are now implemented; see the current checkpoint for production verification. The initial acceptance notes below describe their original research state. The latest scanner/provider decision is recorded at the end of this document.

## Confirmed decisions

- Public domain: leaderboards.gdggt.dev. Existing Vercel project and app codebase.
- Community directory is the eligibility list. Georgia Tech SSO through Supabase is the intended member sign-in. No Google login, open self-registration or email-only membership assertion.
- NFC is preferred. All cards, future Wallet passes and QR credentials resolve to the same internal directory member and ledger. Credentials are independent, replaceable and revocable.
- Only super admins configure rewards, issue credentials, award/reverse points and approve claims. A tap identifies a member; a confirmed activity award is a separate authenticated operation.
- Member visibility on a public leaderboard requires opt-in and an alias. Directory emails, private attendance and ledger reasons never become public.
- Merch, event registration priority and travel consideration are configurable perks, subject to availability and chapter approval. No automatic travel funding or guaranteed admission.

## Platform evidence

| Path | What works | Constraints |
| --- | --- | --- |
| Physical NDEF card to iPhone | OS reads HTTPS URL; notification opens website | User taps notification. Not direct NFC scanning inside an iPhone PWA. Safari and installed PWA sessions may differ. |
| Physical NDEF card to Android | Web NFC reads/writes NDEF in supported Chrome browsers | HTTPS, foreground, permission and actual NFC hardware. Feature detection alone is insufficient. |
| Apple Wallet NFC pass to iPhone | Native ProximityReader/VAS integration can read supported loyalty passes | Native entitlement, approved integration and compatible reader requirements. Not exposed to web apps. |
| Apple Wallet NFC pass to hardware | VAS-capable certified reader and enhanced NFC pass certificate | Paid Developer membership alone is insufficient. NFC payload max 64 UTF-8 bytes. |
| Wallet QR fallback | Signed pass can carry a barcode linked to the same member | Camera fallback only, not NFC. Pass signing certificate and private key still required. |
| X100 Walmart reader/writer | Listing describes UID copying and selected RFID/NFC formats | No verified manufacturer SDK, PC/SC contract or VAS certification found. Not connected locally. No compatibility claim. |

Apple's background reading documentation: https://developer.apple.com/documentation/corenfc/adding-support-for-background-tag-reading

Web NFC capabilities: https://developer.chrome.com/docs/capabilities/nfc and https://w3c.github.io/web-nfc/

Apple contactless membership requirements: https://developer.apple.com/wallet/loyalty-passes/

Native reader: https://developer.apple.com/documentation/ProximityReader and https://developer.apple.com/documentation/proximityreader/accepting-loyalty-passes-from-wallet

Pass NFC constraints: https://developer.apple.com/documentation/walletpasses/pass/nfc-data.dictionary

Wallet certificates: https://developer.apple.com/help/account/capabilities/create-wallet-identifiers-and-certificates

Wallet distribution: https://developer.apple.com/wallet/get-started/

Google Wallet Smart Tap (future adapter): https://developers.google.com/wallet/smart-tap/introduction/overview

Owned reader listing: https://www.walmart.com/ip/16816770605

## Threat model and mitigations

Plain NDEF identifiers and ordinary QR codes are copyable. Neither a UID nor a static URL proves physical attendance. Keep credentials opaque, hash at rest and exclude from analytics, logs, query strings and public leaderboard data. A super admin confirms the resolved member and selected activity; the server rechecks eligibility, session, activity dates and current rule before committing an immutable ledger entry. Use transaction locks and unique member/activity award constraints. Retry keys must be bound to the exact actor and document. Offline taps must not silently queue awards.

Revocation affects server resolution immediately. Replacement creates a new credential, leaving the member ID and ledger unchanged. Do not permanently lock a tag automatically. Do not use duplicated card UIDs as database identifiers. For cryptographic physical-presence proof, a separately provisioned secure tag such as NTAG 424 DNA with unique per-read authentication is a future hardware option, not a property of ordinary cards.

NXP tag security: https://www.nxp.com/products/rfid-nfc/nfc-hf/ntag-for-tags-and-labels/ntag-424-dna-424-dna-tagtamper-advanced-security-and-privacy-for-trusted-iot-applications:NTAG424DNA

Transaction authorization: https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html

## Member authentication boundary

Supabase custom OAuth/OIDC supports standards-based GT identity providers. The submitted GT request is pending. Verify identity server-side, require the configured GT provider and confirmed identity email, match exactly to an active nondeleted nonmerged directory member, and pin provider subject after first connection. Recheck eligibility on every private request. Never accept a browser-supplied member ID as authorization. Separate member cookies from admin cookies and keep member sessions host-only.

https://supabase.com/docs/guides/auth/custom-oauth-providers
https://supabase.com/docs/guides/auth/sessions/pkce-flow
https://supabase.com/docs/guides/auth/server-side/advanced-guide

## External acceptance gates

Real GT SSO sign-in awaits IAM configuration. Real Apple Wallet signing awaits a Pass Type ID certificate, private key and issuer configuration. Wallet NFC additionally awaits the enhanced entitlement and a verified compatible reader. X100 operation and real card-chip compatibility require physical tests. These must remain explicitly unavailable until configured; a visual button or mock test is not acceptance evidence.

## Additional caveats checked

- iOS background reading is unavailable while the camera or Apple Wallet is in use. Close QR-camera scanning before returning to card tapping. iPhone XS and later are documented as supporting background tag reading; actual chip/device cases still need testing.
- Home Screen web apps have storage isolated from the browser. An iPhone URL-card handoff can ask an officer to sign in to Safari even while the PWA is signed in. Do not transfer admin bearer tokens in card URLs or weaken cookie scope to hide this behavior. Apple WWDC23: https://developer.apple.com/videos/play/wwdc2023/10120/
- NFC tag read/write permissions require a user gesture. Stop scan/write operations on unmount or when hidden. Never call irreversible makeReadOnly as part of normal card issuance. Never automatically overwrite a nonempty tag.
- NTAG213 has 144 bytes user memory; NDEF overhead consumes part of capacity. A short HTTPS URL plus a 43-character opaque token fits this class of tag. This does not establish compatibility with the owner's purchased cards; 125 kHz RFID is not phone NFC. https://www.nxp.com/docs/en/data-sheet/NTAG213_215_216.pdf
- Apple NFC pass messages are limited to 64 bytes; use the compact credential token, not a long website URL. A normal Wallet signing certificate does not enable NFC. Configure the VAS P-256 public encryption key, authentication requirement and sharing prohibition only when enhanced signing is ready.
- sharingProhibited hides normal sharing affordances; it is not an anti-copy guarantee. Current server credential status and human confirmation remain authoritative.
- Expired Wallet signing certificates leave installed passes in place, but prevent signing new passes and sending updates. Revocation can break installed passes. Revoking a member/card in the chapter database must therefore deny resolution immediately, independent of Wallet UI updates. https://developer.apple.com/wallet/get-started/
- App Clips and Capacitor can share some code, but still add native signing, entitlements and release maintenance. They do not turn an ordinary iPhone PWA into a Wallet NFC reader. Keep them outside this implementation unless the owner chooses that tradeoff later.
- Vercel's existing project can serve a specific subdomain using a CNAME. No wildcard or nameserver transfer is needed. Add and verify only leaderboards.gdggt.dev. Preserve apex, email and existing records. https://vercel.com/docs/domains/working-with-domains/add-a-domain
- Existing PWA policy intentionally does not cache API/private HTML data. Keep scanner resolution, balances and awards online-only. Never present an offline tap as a successful points award.
- Member identity linking must use provider identity data returned by Supabase's server-validated getUser result, not editable user_metadata. The current Supabase Auth custom OIDC source verifies the issuer/JWKS/audience and extracts EmailVerified. Only the configured custom GT provider is acceptable. Source inspected: https://github.com/supabase/auth/blob/master/internal/api/provider/custom_oauth.go
- The Supabase provider-to-GT PKCE and our application-to-Supabase PKCE are separate hops. Bind the application callback to a host-only flow cookie and a short-lived, single-use server flow record. Never accept a supplied access token or member ID as a login shortcut.
- Concurrent check-ins need both transaction-level member locking and a unique member/activity constraint. Idempotency keys alone do not prevent a second physical tap generating a new request key.
- Community removal, merge and email changes can invalidate eligibility. Credentials and sessions must be checked against the current member record, not the record captured at card issuance. Merging members with rewards needs an explicit reconciliation policy; do not silently discard balances or combine duplicated attendance awards.

## Implementation acceptance checklist

1. Service-only rewards tables with RLS, explicit grants and pinned function search paths.
2. Immutable points entries and compensating reversals, reason and actor attribution, unique activity awards, exact-request retry receipts.
3. Super-admin-only endpoints and navigation, independently checked inside database transactions.
4. Opaque, separately revocable credentials. One canonical member ledger across card/QR/Wallet adapters. No member PII in tag payloads.
5. Existing PWA scanner with Android NFC feature detection and iPhone URL handoff, visible online/permission/error states. QR remains an optional fallback.
6. Opt-in public alias rankings with bounded pagination. Member-only details require GT SSO and active directory membership.
7. Configurable activity points and threshold perks; claim/review/fulfilment state transitions and inventory reservations must be atomic.
8. Real device/certificate/provider checks remain external acceptance gates and must never be marked passed using mocks.

Research synthesis completed after the requested research window. The practical initial release is physical NDEF cards plus Android Web NFC and iPhone URL handoff. Wallet NFC is an integration gate, not a capability we can add to Safari with JavaScript. No second native app or unverified hardware bridge will be installed. The system will preserve one directory member identity while using separately revocable credentials and a server-owned points ledger.

## Existing iPhone scanner investigation — 2026-11-08

Owner correction: **free only, no scanner-service subscriptions**. The existing paid Apple Developer membership is already owned. No additional purchase, trial subscription, provider signup, certificate disclosure or provider send is authorized by this research. The owner subsequently approved an owned native scanner/writer; the latest implementation decision is below.

The requested combination is an existing iPhone app that reads our self-issued Apple Wallet NFC passes and connects to the chapter backend without an additional paid service. No option satisfying that full combination was verified. This is a search result, not a claim that no such app can exist.

| Candidate | Verified capability | Why it does not currently satisfy the free route |
| --- | --- | --- |
| [PassEntry](https://docs.passentry.com/documentation/guides/passentry-reader-app/guide) | iPhone NFC/QR app and [third-party validation](https://docs.passentry.com/documentation/guides/validation-options/guide) with configurable HTTPS endpoint and Bearer token | [Published pilot price](https://passentry.com/pricing) starts at GBP199/month. NFC is approval-gated after a live plan. Compatibility/provisioning for our own issuer and encryption keys still needs provider confirmation. Rejected under the owner's free-only requirement. |
| [PassLite](https://passlite.io/pricing) | Free tier advertises up to100 loyalty passes and scanning | API/webhooks and custom signing certificates are Pro features. Its [current App Store description](https://apps.apple.com/gb/app/passlite/id6764145478) describes QR scanning against a PassLite account; direct Wallet NFC support for our issuer is unverified. |
| [Walletap](https://www.walletap.com/) | Free25-card tier and a [mobile scanner](https://www.walletap.com/apps/mobile) | Published API/integration access is in paid plans. No free custom validation path for our self-issued passes was verified. The App Store description establishes camera scanning, not acceptance of our own VAS keys. |
| [Passcreator Smart Scan](https://www.passcreator.com/en/docs/wallets/nfc/scanning-nfc) | Wallet NFC via a supported USB VAS reader connected to iOS | Requires external reader hardware, account NFC enablement and matching pass templates. Not a verified free iPhone-to-iPhone reader. |
| [CodeREADr](https://www.codereadr.com/changelog/) | Apple VAS/Google Smart Tap validation using certified Zebra or VTAP hardware | Hardware-mediated scanning, not a verified free iPhone-native VAS reader for this setup. |
| [NFC.cool](https://nfc.cool/) | Free ordinary tag reading and camera scanning | Its documented free features do not establish Apple Wallet VAS reading. Webhooks are a Platinum feature. Ordinary NDEF tag support is not Wallet NFC compatibility. |
| [PassSource](https://www.passsource.com/info/) | Optical pass scanning and a custom API | Provider FAQ says NFC passes are unsupported; API access requires a paid account. |
| [Android Universal Reader](https://github.com/kormax/android-universal-reader) | Public demonstration of configurable Apple VAS reading | Android-only, and the author explicitly disclaims certification. It does not meet the officer team's iPhone-only requirement. |

The PassEntry contract was reviewed before any implementation. Its documented request is `scan.scanValue`, `scan.readerId` and `scan.scanType` (`nfc` or `barcode`), with optional loyalty fields; its response is `validationResponse` with `successful`/`failed` status and optional reader message. That is a concrete potential integration, but no paid-provider connector was added after the free-only correction. A free download or a trial does not establish free NFC service or free integration access.

### Apple requirements that still apply

- [NFCVASReaderSession](https://developer.apple.com/documentation/corenfc/nfcvasreadersession) requires an Apple-granted reader entitlement. Standard NDEF/tag-reading permission is insufficient evidence of VAS permission.
- Apple lists the separate NFC PassKit certificate request on its [Wallet resources page](https://developer.apple.com/wallet/resources/). The current QR signing certificate does not by itself establish NFC approval.
- A native scanner could reuse the existing backend and Super Admin confirmation flow, avoiding a scanner-service subscription. It still adds native signing, distribution and updates, and actual NFC remains conditional on Apple's approval and device testing. No promise of approval or fee-free special contractual terms is made.
- A PWA wrapper alone does not provide the native NFC framework or its entitlement. No browser preference, unsigned profile or generic NFC app will be treated as an approved workaround.

### Draft Apple enquiry — not sent

This is for GDG at Georgia Tech. We want members to tap an Apple Wallet membership pass on an officer's iPhone for event check-in. Our website already issues QR passes under `pass.dev.gdggt.membership`, and our existing Apple Developer team is `7THP95SRTV`. Which approvals do we need for NFC passes and an iPhone scanner using NFCVASReaderSession, and is our existing developer team eligible?

Confirm the responsible entity, expected pass volume, distribution route and reader implementation before submitting an application. Do not invent those details or accept provider terms while they remain undecided. No request was submitted and no email was sent.

### Pending owner choice

The owner has been asked whether to build a small native scanner, continue looking for a free existing app, or retain the current PWA QR path. Until answered, keep live QR issuance working and contactless flags off. No scanner database migration, API, app shell or production feature flag was changed during this investigation.


## Owned scanner implementation — 2026-11-08

The owner chose an owned iPhone scanner rather than a recurring scanner subscription and delegated implementation/distribution choices. The SwiftUI app uses the existing trusted HTTPS workspace with native NFC operations, the existing QR camera and native pass sharing. Standard cards use the modern TAG entitlement and Core NFC NDEF operations; Wallet uses a separate VAS build and remains approval-gated. No separate directory, point authority or private key is installed on the phone. The website keeps all current Super Admin authorization and external event flows.

Finished-card recommendation: start with ten [GoToTags NTAG215 PVC cards](https://store.gototags.com/nfc-pvc-card-ntag215/) (listed $0.48 each at quantity10, before shipping/tax), then the [200-pack](https://store.gototags.com/nfc-pvc-card-ntag215-200-pack/) after hardware acceptance. See [the operating guide](../operations/IPHONE_SCANNER.md) for specifications, writing/recovery steps, builds, approvals, protocol sources and actual acceptance limits. No order was placed.
