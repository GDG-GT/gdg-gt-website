# GDG iPhone scanner and card writer

The owned app adds iPhone NFC hardware to the existing GDG workspace. Members, cards, external event registration and points remain in the website database. There is no scanner subscription, second member directory or offline award queue.

## What is implemented and what needs a device

| Capability | Software | Acceptance requirement |
| --- | --- | --- |
| Read physical GDG cards | Native Core NFC NDEF reader, trusted credential validation, existing member resolver | Provision and install the app, scan a real issued card |
| Write physical cards | Blank-card check, capacity/read-only check, write one URL, read back and compare | Test the first sample card on an iPhone |
| Scan Wallet QR | Existing camera scanner inside WKWebView | Camera permission and actual screen-to-camera test |
| Share an issued Wallet pass | Protected download, native share sheet, temporary file removed after sharing | Real iPhone share/Add to Wallet test |
| Tap an NFC Wallet pass | Native VAS reader, server decryption, session-bound challenge, replay protection | Apple NFC issuer approval, VAS reader entitlement/provisioning and physical acceptance |
| Award/check in | Existing Super Admin review and confirmation, external event connector | Real event registration source must be configured by that event |

The normal app is signed and uploaded to App Store Connect as **GDG GT Scanner**, version **1.0.0 (2)**, app ID `6832381059`. Apple processed the build and it is assigned to the private **GDG Officers** internal group. The owner's existing Apple account is invited; no other tester was invited. Open the invitation on the iPhone in Apple's free TestFlight app. The group has automatic distribution off. No public App Store release or external beta review was submitted. TestFlight builds expire after 90 days; upload a new numbered build before expiry if continuing the beta. For longer-term officer distribution, an Apple-reviewed unlisted App Store release is a separate step after device acceptance. It was not submitted here.

The signed archive and App Store distribution IPA were verified locally; the IPA has the TAG entitlement and is not debuggable. Release and optional Wallet device builds and an unsigned archive also compiled. This establishes signing/distribution, not physical device acceptance. Keep Wallet NFC flags off until issuer/reader approval and device acceptance are complete. The normal build has NDEF capability only; the optional Wallet build also requests VAS and cannot grant itself Apple's entitlement.

## Cards to buy

Start with **10 plain white PVC NTAG215 cards**, then order printed/bulk cards after the sample works. These are complete credit-card-sized cards with the antenna inside, not loose chips. Product details checked 2026-11-08:

- [GoToTags NTAG215 PVC cards, minimum 10](https://store.gototags.com/nfc-pvc-card-ntag215/): listed at $0.48 each for 10, before shipping/tax. NXP NTAG215, 504-byte memory, NFC Forum Type 2, pre-NDEF-formatted, 85.5 × 54 × 0.9 mm, shipment origin US/Canada, normally stocked. Ten cards are $4.80 before shipping/tax. Confirm the supplied cards are unlocked and rewritable.
- [Same NTAG215 cards, 200-pack](https://store.gototags.com/nfc-pvc-card-ntag215-200-pack/): listed at $49.98 before shipping/tax. Wait for the sample result before ordering this quantity.

NTAG213 also has enough space for our URL, but NTAG215 gives room for later changes. Choose plain PVC rather than metal for the sample. Do not buy 125 kHz access cards, UID-cloning blanks, MIFARE Classic cards or permanently locked/encoded Amiibo cards for this flow. A printed design is optional; do not print the private credential URL in public artwork files. If adding a QR to each card later, encode that card's existing credential privately rather than creating a separate identity.

The Walmart X100 is not established as an NDEF URL writer or Apple VAS reader. This app uses the iPhone itself as the writer and reader, so the X100 and its unknown drivers are not needed for the proposed workflow. Do not base a hardware purchase on its UID-copying capability.

## Issue and write a card

1. Install GDG GT Scanner from the private TestFlight invitation on the officer's iPhone. Enter the existing chapter access code on the dedicated sign-in screen, then the existing Super Admin email and password. Safari/PWA cookies are separate; signing into Safari does not sign into this app.
2. Open Members in the Points & cards workspace. Select a real active community member, choose NFC card, give it a useful label and issue the credential.
3. Tap **Write blank NFC card** and confirm the native write prompt. Hold the card against the top of the iPhone. Keep it still until **Card written and verified** appears.
4. The app refuses read-only cards, unsupported tags, insufficient memory and cards that already contain data. It does not erase, lock or overwrite them. If the write or verification is interrupted, keep that card aside and scan it before reusing it.
5. Open Check-in scanner and scan the card. Confirm it resolves to the intended member before handing it over. Choose the activity and explicitly confirm any point award.
6. If the page closed before programming, select the member's existing card and tap **Program card**. This retrieves the same active credential privately; it does not issue another card or consume another credential slot. Program only one physical card per credential unless intentionally replacing it.
7. For a lost or compromised card, revoke that credential and issue a replacement. Member points remain in their account.

The card contains an opaque URL such as `https://gdggt.dev/tap#card=<43-character credential>`, not a name, email or balance. The fragment does not go into the HTTP request URL, but anyone with a copy can present the same static credential. Officers still verify the person and server-side revocation. NFC tap identifies a member; it is not a payment, identity document or proof of event registration by itself.

## Check in to a separate event

Use Event connections in the same workspace. Scan either the member's physical card or Wallet QR, verify the registration result from that event, then explicitly confirm check-in. Points require the existing separate Super Admin action. See [event membership integration](EVENT_MEMBERSHIP_INTEGRATION.md) for the event adapter, registration mapping, account linking and API keys. Building this scanner does not automatically configure a future DevFest database.

## Generate, build and test the app

Sources: `native/Scanner`. Requires Xcode with iOS SDK and XcodeGen. The generated `.xcodeproj`, build artifacts and per-user signing state are ignored. No new dependency or scanner service is required at runtime. Existing archive: `native/Scanner/build/GDGScanner-Build2.xcarchive`; distribution package: `native/Scanner/build/TestFlight2/GDGScanner.ipa`. Both are ignored by Git.

```sh
xcodegen generate --spec native/Scanner/project.yml
swift test --package-path native/Scanner
xcodebuild -project native/Scanner/GDGScanner.xcodeproj -scheme GDGScanner \
  -configuration Release -sdk iphoneos -derivedDataPath native/Scanner/build \
  CODE_SIGNING_ALLOWED=NO build
```

The App ID and profiles are now configured; do not create another app or Bundle ID. For subsequent builds, open the generated project in Xcode. Use the existing developer team `7THP95SRTV`, bundle ID `dev.gdggt.scanner`, and the normal **GDGScanner** scheme. The current App ID has NFC tag-reading capability. Preserve that capability and the existing automatic-signing setup. Increment the build number before any new TestFlight upload. Select a connected iPhone and run, or archive Release and upload to the matching App Store Connect app for private TestFlight testing. A normal development build does not require publishing the app in the App Store. Command-line signing/export/upload worked even though Xcode's GUI component updater and Simulator still need the local component update. That GUI issue did not prevent this TestFlight release. TestFlight distribution needs Apple's processing and any applicable beta review; external testers cannot be assumed approved.

The initial TestFlight group is owner-only. Inviting other officers is a separate distribution step; no Apple team roles or website permissions were granted to them. External beta review needs appropriate review access and accurate contact information before submission; no production Super Admin credentials were supplied to Apple.

The app requests only NFC and camera permissions on use. It opens `https://gdggt.dev/admin/scanner` and sends an authenticated Super Admin to `/admin/rewards`; external domains and subframes cannot access its native bridge. Login and CSRF stay in the website. The app stores no private key, point authority, member cache or scanned credential history. Card operations are cancelled on backgrounding, sign-out and navigation. No member data or keys belong in Xcode build settings.

## Enable Wallet NFC only after approval

1. Obtain Apple's NFC-enabled pass issuer approval for `pass.dev.gdggt.membership` and the VAS reader entitlement for `dev.gdggt.scanner`. A paid developer membership or ordinary pass signing certificate alone is insufficient.
2. Use the **GDGScannerWallet** scheme/configuration after the provisioning profile grants VAS. It includes modern TAG and VAS entitlement values. Both physical-card schemes use the current TAG entitlement for NDEF operations; the old NDEF entitlement value is deprecated. The ordinary scanner remains usable for physical cards without VAS.
3. A separate encrypted P-256 VAS key pair is prepared in the owner's private `Library/Application Support/GDG GT/Wallet Issuer` folder. It is not in Git, the phone or frontend. Preserve it; do not regenerate it after issuing NFC passes. The existing RSA pass-signing key is a different key and stays unchanged.
4. In encrypted server configuration, set `APPLE_WALLET_NFC_PUBLIC_KEY` to the base64 SPKI public key, `APPLE_WALLET_VAS_PRIVATE_KEY` to its matching encrypted PEM and `APPLE_WALLET_VAS_KEY_PASSPHRASE` to its passphrase. Retain all existing Wallet signing settings.
5. Set `APPLE_WALLET_NFC_ENABLED=true`, `APPLE_WALLET_READER_VERIFIED=true` and `APPLE_WALLET_VAS_READER_ENABLED=true` only for the approved, device-verified rollout. Do not enable them merely because the code compiles. Existing QR-only passes need re-downloading/re-adding as NFC-enabled passes; no Wallet push update service was introduced.
6. Scan an actual issued NFC pass, verify the member, test cancellation, two simultaneous requests, expired scans, replay under another session and revocation. Compare actual VAS bytes against Apple's integration material supplied during approval. Local generated crypto vectors prove algorithm behavior, not device interoperability.

The reader API first issues an encrypted challenge bound to the current Super Admin session, pass identifier, random nonce and 75-second expiry. It accepts only authenticated P-256 ECDH / X9.63 SHA-256 / AES-256-GCM VAS data with a current timestamp and this issuer's exact opaque credential format. The database rechecks the live session and active member, rejects cross-challenge or cross-session cryptogram replays and restricts each challenge to one scan. Exact retries are safe. A scan never awards points automatically.

Apply append-only migration `202611080144_reward_wallet_reader.sql` once using the existing deployment process. The replay table stores hashes and actor/session references only. It has RLS and explicit service-only grants; no anonymous/authenticated access. Rows older than 24 hours may be removed by an authorized maintenance job because cryptograms expire after 75 seconds. Never prune fresh rows.

## Acceptance checklist

- Sign in and out on the actual app; ordinary Admin cannot manage points/cards.
- Write a blank sample and resolve the intended member; populated/read-only card is refused.
- Interrupt a write and keep the card aside until its contents are checked.
- Scan the same card twice for one activity; only one award is possible.
- Revoke the credential and inactivate a test member; both stop resolving.
- Scan Wallet QR from another iPhone screen; share/Add to Wallet only to the intended member.
- Test connected-event registration rejection and duplicate-safe attendance.
- After Apple approval only: NFC Wallet acceptance, wrong issuer, tamper, expiry, replay and revocation.

Do not create fictional production members or points for acceptance. Use a real consenting member or the isolated test database.

## Sources

- [Apple NFC tag-reader sample](https://developer.apple.com/documentation/corenfc/building-an-nfc-tag-reader-app)
- [Apple guidance on modern TAG entitlement](https://developer.apple.com/forums/thread/781403)
- [Apple VAS reader API](https://developer.apple.com/documentation/corenfc/nfcvasreadersession)
- [Apple TestFlight lifetime and distribution](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)
- [Apple Wallet setup and pass distribution](https://developer.apple.com/wallet/get-started/)
- [Public protocol research by Grayson Martin](https://gist.github.com/gm3197/ad0959476346cef69b75ea0523214350) and [Kormax Apple VAS research](https://github.com/kormax/apple-vas): protocol facts used for an independent implementation, not a claim of Apple certification. Validate against Apple's approved integration documentation and real hardware before activation.
