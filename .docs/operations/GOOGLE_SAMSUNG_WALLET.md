# Android membership passes

## Google Wallet NFC and Smart Tap

Google Wallet NFC uses Smart Tap. It is separate from Apple VAS and ordinary physical NDEF tags. A QR-enabled membership pass does not become NFC-readable automatically. Google requires a Smart Tap-capable certified terminal, its reader authentication key, a Redemption Issuer/Collector ID and the matching pass configuration. Google directs prospective terminal providers to contact support for the protocol/certification documentation. The current iPhone reader and new Android APK do not have that certification or a Google Smart Tap reader implementation. No subscription, terminal purchase or unsupported phone-to-phone promise has been added.

The server now prepares the documented pass configuration behind three **disabled by default** settings:

- `GOOGLE_WALLET_SMART_TAP_ENABLED=true`
- `GOOGLE_WALLET_SMART_TAP_READER_READY=true` only after the actual certified reader is configured and tested
- `GOOGLE_WALLET_REDEMPTION_ISSUER_IDS` as a comma-separated list of numeric Redemption Issuer IDs

When fully configured, issuance sets the class `enableSmartTap` and `redemptionIssuers`, and the object `smartTapRedemptionValue` to the same opaque credential used by QR. It patches existing classes as well as creating missing ones. Missing/invalid reader settings keep NFC data off and leave QR available. Google errors do not produce a purported NFC-enabled save link. Disabling configuration stops writing NFC redemption data to newly updated objects; if retiring a previously enabled live deployment, also disable the class in Google and revoke affected credentials as appropriate.

### Chapter issuer setup, 2026-11-09

At the owner's request, the existing chapter issuer was configured for the future owned reader. Google accepted a new ECDSA P-256 public authentication key, version **1**, on issuer **3388000000023239310** and assigned Collector ID **29267263**. A fresh issuer GET verified the registered public key, version and Collector ID. No existing key was replaced and no new issuer or service-account permission was created. The Google Wallet issuer's RSA signing identity is separate and unchanged.

The matching reader private key is encrypted in `~/Library/Application Support/GDG GT/Google Smart Tap/reader-encrypted-key.pem`, with a separate local passphrase file. Both files are outside Git and restricted to the owner. Only the public key was sent to Google. The private key was not added to Vercel, shipped in the APK, or sent in the support request. Preserve the pair; do not regenerate or copy a shared private key into a public application package. Reader provisioning and device key storage must be designed with Google's approved protocol material before deployment.

The private runtime configuration and production-only Vercel settings now stage the chapter's own issuer in `GOOGLE_WALLET_REDEMPTION_ISSUER_IDS`, with `GOOGLE_WALLET_SMART_TAP_ENABLED=false` and `GOOGLE_WALLET_SMART_TAP_READER_READY=false`. No class or member object was changed to advertise NFC, no replacement credential was issued, and no email was resent. The existing APK still reads physical NDEF cards and QR; it has no Smart Tap protocol reader. The iPhone VAS path also does not read Google Smart Tap.

The owner confirmed submitting the official terminal-provider documentation request for **GDG at Georgia Tech**, contact and allowlist address **tejas.singhal@gatech.edu**. Do not resubmit. Google documentation access is still pending; the owner-reported submission is recorded in the setup evidence/checkpoint. Access to documentation, reader implementation, certification and real-device acceptance are still required. A Collector ID alone does not establish any of those. Public Google Wallet pass issuance is also still pending: despite approval emails, the issuer console shows In review and an ordinary account receives Google's test-only rejection.

Next steps are to obtain Google's terminal-provider documentation and confirm the supported phone-reader platform, implement and certify the owned reader, provision its key/Collector ID securely, enable the class/object settings, and test on a real Android Wallet phone. If Google's approved implementation requires different reader keys, register the correct public key before activation. Reader output must go through the existing authenticated member/event check-in APIs and server-side revocation checks. The APK's normal NDEF mode cannot substitute for that protocol. Google publishing review also remains separate and pending.

Primary references: [Smart Tap overview and terminal certification](https://developers.google.com/wallet/smart-tap/introduction/overview), [issuer/key and Collector ID setup](https://developers.google.com/wallet/smart-tap/introduction/issuer-configuration), [class/object configuration](https://developers.google.com/wallet/smart-tap/introduction/pass-configuration). Direct Samsung Wallet integration remains excluded by the owner; supported Samsung phones use Google Wallet.

Google Wallet support uses the same `kind=wallet` chapter credential as Apple Wallet. It does not introduce Google sign-in to the chapter website. Saving to Google Wallet requires the recipient's Google account at Google's site.

## Google issuer setup

Owner authorized free setup on 2026-11-08 and separately approved the Console and Wallet API terms. The business name is GDG at Georgia Tech, United States, under the owner's existing Google account. Merchant ID `BCR2DN6DWL3IRBQG` is not the Wallet issuer ID. Wallet issuer: `3388000000023239310`. Dedicated Cloud project: `gdg-gt-wallet` (`28621550653`). Wallet API is enabled. The dedicated service account `gdg-wallet-issuer@gdg-gt-wallet.iam.gserviceaccount.com` has Console Developer access and no Cloud project IAM role. Public key`58d1cf229d795c4a48c1cb8f66d976aa4aacf564` is registered; Google OAuth authentication and live API class/object preparation were verified. One Google-only preview object named GDG preview only exists under suffix`member_b210000000004000800000000000de00`; it has no chapter database record or authority. The six private runtime settings were saved as production-only sensitive Vercel variables. Publishing approved remains false. The publishing request was submitted and visibly confirmed In review; the Console estimates2–3days. Do not submit it again. Business information and the linked existing GDG@GT identity profile are under review. Do not create duplicate accounts/projects.

At the owner’s explicit direction, the Console support phone is the official Georgia Tech Center for Student Engagement / Student Organizations office number, +1 4048943458, verified at https://studentengagement.gatech.edu/about/contact-us. This is the campus office’s public number, not an officer’s private line. Chapter email remains gdg@gatech.edu and support URL https://gdggt.dev/contact.

Server settings, all private runtime configuration:

- `GOOGLE_WALLET_ENABLED=true`
- `GOOGLE_WALLET_ISSUER_ID` = the numeric Wallet issuer ID
- `GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL` = the dedicated issuer service account
- `GOOGLE_WALLET_SERVICE_ACCOUNT_KEY` = its PEM RSA private key, never a frontend/build variable
- `GOOGLE_WALLET_KEY_PASSPHRASE` = private encrypted-key passphrase
- `GOOGLE_WALLET_PUBLISHING_APPROVED=true` only after Google grants publishing access

Grant the service account the Wallet **Developer** role on this issuer. It requires no Cloud project Editor/Owner role, billing account, payment card, Android app or Google OAuth consent screen. The existing RSA signing key was generated locally and stored encrypted; only its X.509 public certificate was uploaded to Google. Store keys privately outside the repository; restrict its filesystem permissions. Do not print it, commit it or paste it into a chat.

Until Google approves publishing, issuance is available only to authorized officers for issuer demo/testing. Member account buttons stay hidden and member issuance returns503. Google's demo account restricts recipients to configured test users. Do not mark publishing approved to bypass that restriction.

## Software and issuance

`server/rewards-google-wallet.mjs` authenticates to Google with a short-lived server OAuth assertion, creates the generic class when missing, upserts a stable member object and signs a short Save to Wallet link referencing that object. The save JWT stays below Google's recommended1800-character limit. QR contains the chapter's opaque credential, not name/email/points. It resolves through the same revoked-card, active-member, event-registration and duplicate-check-in checks as other chapter credentials.

Admin endpoint: `GET /api/v1/admin/rewards/google-wallet/:credentialId`, Super Admin only. Member endpoint: `GET /api/v1/rewards/google-wallet/:credentialId`, current signed-in member's own credential only, approved issuer only. Both recheck member/credential status after generation, return a non-cacheable redirect, and never return the signing key. Missing configuration fails closed.

Google receives the member's display name and opaque QR credential to render the membership pass. No email or points ledger is sent. A saved pass is a static membership credential. Revocation is enforced by the chapter at scan time; revoking a chapter credential does not yet remove a card from Google's UI. Saving again updates the member object. Automatic balance updates, Wallet push notifications and automatic Google-side visual revocation are not part of this release.

This is **QR support**, not Google Smart Tap. Google's NFC protocol and reader certification are separate from Apple VAS. An iPhone VAS entitlement does not enable Google Wallet NFC reading.

## Samsung

Owner explicitly deferred direct Samsung Wallet integration on2026-11-08. Keep Apple Wallet and Google Wallet only. No Samsung account was created.

Samsung phones can use the Google Wallet pass where Google Wallet is supported. This is different from issuing directly into the Samsung Wallet app.

Direct Samsung Wallet integration requires a Samsung account, Wallet Partners Portal onboarding, a card template/Card ID, Partner ID and Samsung-signed certificates. Its encrypted card-data token is a JWS-wrapped JWE. No Samsung account, agreement, certificate or production approval is implied by implementing Google Wallet. Do not display a Samsung Wallet button until that separate issuer integration and device acceptance are complete. No third-party subscription was selected.

## Sources

- [Google issuer onboarding](https://developers.google.com/wallet/generic/getting-started/onboarding-guide)
- [Google web issuance and link size](https://developers.google.com/wallet/generic/web)
- [Google launch checklist](https://developers.google.com/wallet/generic/test-and-go-live/launch-checklist)
- [Google REST methods](https://developers.google.com/wallet/reference/rest)
- [Samsung onboarding](https://developer.samsung.com/wallet/overview/onboardingguide.html)
- [Samsung card token format](https://developer.samsung.com/wallet/securityauthentication/carddatatoken.html)
