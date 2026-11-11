# GDG iPhone workspace, scanner and card writer

The owned iPhone app now opens the full admin workspace with native sign-in, native navigation, account locking and the existing NFC hardware bridge. Members, cards, external event registration and points remain in the website database. There is no scanner subscription, second member directory or offline award queue.

## What is implemented and what needs a device

| Capability | Software | Acceptance requirement |
| --- | --- | --- |
| Read physical GDG cards | Native Core NFC NDEF reader, trusted credential validation, existing member resolver | Provision and install the app, scan a real issued card |
| Write physical cards | Blank-card check, capacity/read-only check, write one URL, read back and compare | Test the first sample card on an iPhone |
| Scan Wallet QR | Existing camera scanner inside WKWebView | Camera permission and actual screen-to-camera test |
| Share an issued Wallet pass | Protected download, native share sheet, temporary file removed after sharing | Real iPhone share/Add to Wallet test |
| Tap an NFC Wallet pass | Native VAS reader, server decryption, session-bound challenge, replay protection | Apple NFC issuer approval, VAS reader entitlement/provisioning and physical acceptance |
| Award/check in | Existing Super Admin review and confirmation, external event connector | Real event registration source must be configured by that event |

The normal app is signed and uploaded to App Store Connect as **GDG GT Scanner**, version **1.0.0 (6)**, app ID `6832381059`. Build6 uploaded successfully. The owner confirmed build6 TestFlight group assignment is complete; do not upload it again. Builds4 and5 were previously visibly assigned to the private **GDG Officers** group. The owner's existing Apple account is invited; no other tester was invited. Build6 supersedes builds3–5 with the final app lifecycle/link fixes and should use that same group. Open the invitation on the iPhone in Apple's free TestFlight app. The group has automatic distribution off. No public App Store release or external beta review was submitted. TestFlight builds expire after 90 days; upload a new numbered build before expiry if continuing the beta. For longer-term officer distribution, an Apple-reviewed unlisted App Store release is a separate step after device acceptance. It was not submitted here.

Build2's retained distribution IPA was verified locally as TAG-only and non-debuggable. Build6's archive is development-signed with TAG capability only; Xcode completed App Store distribution re-signing/upload successfully, but the upload destination did not retain a local build6 IPA. Do not confuse the archive's development entitlements with the uploaded distribution package. Release and optional Wallet device builds and an unsigned archive also compiled. This establishes signing/distribution, not physical device acceptance. Keep Wallet NFC flags off until issuer/reader approval and device acceptance are complete. The normal build has NDEF capability only; the optional Wallet build also requests VAS and cannot grant itself Apple's entitlement.

## Password AutoFill and app verification

Build7 adds `webcredentials:gdggt.dev` to both normal and optional Wallet entitlements. The website publishes the matching `7THP95SRTV.dev.gdggt.scanner` identity at `https://gdggt.dev/.well-known/apple-app-site-association`, as JSON with no sign-in or redirect. This allows iOS and password managers to associate native email/password fields with saved gdggt.dev credentials. The access-code field remains separate. There are no universal-link handlers or extra domains.

Build7 archive and provisioning profile include Associated Domains and TAG. Its App Store Connect upload succeeded at2026-11-10T19:44:34Z; do not upload it again. Processing/group assignment is separate and recorded in phase0/ios-autofill-icons-release.json. Build6 cannot acquire an entitlement through a website update: install the new TestFlight build after Apple processing and officer-group assignment. Apple's association CDN can cache results, so verify the CDN endpoint and test a fresh installation if the prior missing association persists. Use `https://gdggt.dev` as the saved Login item's website. A successful archive/upload does not prove the actual iPhone's 1Password matching or Face ID behavior.

The website now also publishes a multi-resolution `/favicon.ico`, explicit PNG icons through512px and the conventional `/apple-touch-icon.png` endpoint. 1Password uses its own rich-icon servers; these website assets cannot force its cache to update. The existing512px icon at `https://gdggt.dev/icons/pwa-512.png` can be used as a custom item icon or supplied to 1Password support. No vault entries or account credentials are modified by the website change.

## Cards to buy

Start with **10 plain white PVC NTAG215 cards**, then order printed/bulk cards after the sample works. These are complete credit-card-sized cards with the antenna inside, not loose chips. Product details checked 2026-11-08:

- [GoToTags NTAG215 PVC cards, minimum 10](https://store.gototags.com/nfc-pvc-card-ntag215/): listed at $0.48 each for 10, before shipping/tax. NXP NTAG215, 504-byte memory, NFC Forum Type 2, pre-NDEF-formatted, 85.5 × 54 × 0.9 mm, shipment origin US/Canada, normally stocked. Ten cards are $4.80 before shipping/tax. Confirm the supplied cards are unlocked and rewritable.
- [Same NTAG215 cards, 200-pack](https://store.gototags.com/nfc-pvc-card-ntag215-200-pack/): listed at $49.98 before shipping/tax. Wait for the sample result before ordering this quantity.

NTAG213 also has enough space for our URL, but NTAG215 gives room for later changes. Choose plain PVC rather than metal for the sample. Do not buy 125 kHz access cards, UID-cloning blanks, MIFARE Classic cards or permanently locked/encoded Amiibo cards for this flow. A printed design is optional; do not print the private credential URL in public artwork files. If adding a QR to each card later, encode that card's existing credential privately rather than creating a separate identity.

The Walmart X100 is not established as an NDEF URL writer or Apple VAS reader. This app uses the iPhone itself as the writer and reader, so the X100 and its unknown drivers are not needed for the proposed workflow. Do not base a hardware purchase on its UID-copying capability.

## Issue and write a card

1. Install the latest GDG GT Scanner beta from the private TestFlight invitation. Build9 is displayed on the phone as **GDG Workspace**. Enter the existing chapter access code, officer email and password in native sign-in. Enable Remember with Face ID to store those credentials in the device-only Keychain protected by the current biometric enrollment. No password is sent to JavaScript or saved in UserDefaults, browser storage, Git or logs. Safari/PWA cookies are separate.

The full workspace is available according to the signed-in officer's server permissions. Native tabs expose Home, Events, Check-in, Members and More. The website header, sidebar and hamburger are removed in the app. The native toolbar provides notifications, account actions and Back only on nested screens. More contains the permission-filtered complete tool directory; points/card changes still require Super Admin. Existing workflow screens reuse the website in a WKWebView, rather than separate SwiftUI implementations of every editor. Native navigation goes through the existing router and unsaved-work safeguards.

The app locks on background and covers account data while inactive. Face ID reopens the same page without reloading valid-session edits. The server checks account status and session revocation on unlock. When a session expires, the native client authenticates with Keychain credentials after biometric approval. A changed password/access code requires manual re-entry. Changed biometric enrollment invalidates the saved secret. Sign out and forget account revokes the server session and removes the Keychain item and local website data. Use another account on the lock screen forgets local credentials/data; it does not revoke an unreachable old session.

PDF, CSV, JSON, ZIP, common image, XLSX and Wallet downloads from the authorized workspace use the native share sheet and private temporary files, bounded to64MiB. External links open outside the admin webview. Face ID and iPhone share-sheet/device acceptance remain physical-device checks.
2. Open Members in Points & cards, select the member, choose NFC card and issue the credential. This creates an **unprogrammed** card. It cannot check in and no card email is sent yet.
3. Use **Write and register NFC card** in GDG Workspace build9 or later. Present one NTAG213/215/216 card. The app checks its seven-byte chip identifier, writes and reads back two records, then registers the chip on the server.
4. A normal tap offers `https://leaderboards.gdggt.dev/`. The second record is MIME `application/vnd.gdggt.card` with the opaque credential. It contains no name, email or points. NFC Tools can still read that record; it is not encrypted.
5. The same credential is bound to one physical chip. Reprogramming checks the expected chip hash before writing; the database rejects competing enrollment on another chip and prevents one active chip being registered twice. Matching is a defense against ordinary copied cards, **not cryptographic chip authentication or an uncloneability guarantee**. The scanner reports the UID; a trusted Super Admin can already award points manually.
6. Registration queues one member email containing their independent Wallet QR and Apple/Google Wallet options. Existing active Wallet credentials are reused. Physical and digital credentials share the member/balance, not the credential secret. Revoking a lost physical card does not revoke an independent Wallet pass.
7. If registration loses its network response, choose **Retry card registration**. It retries the same chip registration without writing again. Do not hand out a card until registered. A write that may have succeeded can be retried on that same card: matching current records are read back rather than overwritten.
8. A copied physical credential cannot be checked in via a QR or pasted token. Physical scans must supply the enrolled chip ID. Legacy test cards need reprogramming; merely tapping their old URL opens the public leaderboard. There is no automatic member or officer login from a card.
9. Blank cards and that same credential’s legacy records can be programmed. Other contents are refused. Read-only, password-protected, incompatible and undersized cards receive an error. The app never sets passwords, changes lock bits or tries to unlock a card. A correctly programmed read-only card can be read and registered; a permanently locked legacy card cannot receive the new public destination and should be replaced for testing.
10. Revoke a lost credential before issuing a replacement. Keep the member account and points. Use a new credential when moving to a different chip. Ordinary URL taps cannot establish which physical chip was scanned.

For the test matrix and limits, see [physical card testing](PHYSICAL_CARD_TESTING.md).

## Check in to a separate event

Use Event connections in the same workspace. Scan either the member's physical card or Wallet QR, verify the registration result from that event, then explicitly confirm check-in. Points require the existing separate Super Admin action. See [event membership integration](EVENT_MEMBERSHIP_INTEGRATION.md) for the event adapter, registration mapping, account linking and API keys. Building this scanner does not automatically configure a future DevFest database.

## Generate, build and test the app

Sources: `native/Scanner`. Requires Xcode with iOS SDK and XcodeGen. The generated `.xcodeproj`, build artifacts and per-user signing state are ignored. No new dependency or scanner service is required at runtime. Latest archive: `native/Scanner/build/GDGWorkspace-Build9.xcarchive`; build9 upload succeeded on 2026-11-11. The exported IPA and archive are ignored by Git. Preserve the final archive for matching dSYMs.

```sh
xcodegen generate --spec native/Scanner/project.yml
swift test --package-path native/Scanner
xcodebuild -project native/Scanner/GDGScanner.xcodeproj -scheme GDGScanner \
  -configuration Release -sdk iphoneos -derivedDataPath native/Scanner/build \
  CODE_SIGNING_ALLOWED=NO build
```

The App ID and profiles are now configured; do not create another app or Bundle ID. For subsequent builds, open the generated project in Xcode. Use the existing developer team `7THP95SRTV`, bundle ID `dev.gdggt.scanner`, and the normal **GDGScanner** scheme. The current App ID has NFC tag-reading capability. Preserve that capability and the existing automatic-signing setup. Increment the build number before any new TestFlight upload. Select a connected iPhone and run, or archive Release and upload to the matching App Store Connect app for private TestFlight testing. A normal development build does not require publishing the app in the App Store. Command-line signing/export/upload worked even though Xcode's GUI component updater and Simulator still need the local component update. That GUI issue did not prevent this TestFlight release. TestFlight distribution needs Apple's processing and any applicable beta review; external testers cannot be assumed approved.

The initial TestFlight group is owner-only. Inviting other officers is a separate distribution step; no Apple team roles or website permissions were granted to them. External beta review needs appropriate review access and accurate contact information before submission; no production Super Admin credentials were supplied to Apple.

The app requests NFC and camera permissions on use. Notifications require a separate explicit Enable action. See [app notifications](APP_NOTIFICATIONS.md) for enrollment, delivery and device checks. It opens `https://gdggt.dev/admin/scanner` and sends an authenticated Super Admin to `/admin/rewards`; external domains and subframes cannot access its native bridge. Login and CSRF stay in the website. The app stores no issuer private key, point authority, member cache or scanned credential history. Remembered officer credentials are held only by the OS Keychain with biometric access control. Card operations are cancelled on backgrounding, sign-out and navigation. No member data or keys belong in Xcode build settings.

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

## Build8+ notifications

Install build8 or later. Open Notifications in More, tap **Enable on this device**, and allow the iOS prompt. Existing installations are not silently opted in. Form submissions notify the owner and authorized recipients in the current reviewed delivery policy. The same private inbox receives relevant accepted-email updates and workspace notices; the OS alert contains generic text. Notification taps open the protected inbox after Face ID unlock. Category switches and device removal are available on that page. Sign-out revokes the session-bound registration. Android native push is intentionally not configured; Firebase was cancelled. Existing PWA notifications remain supported.
