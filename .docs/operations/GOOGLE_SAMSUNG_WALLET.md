# Android membership passes

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
