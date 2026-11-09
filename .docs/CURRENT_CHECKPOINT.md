## Latest release — member delivery and workspace improvements

2026-11-09: feature commit `4c4377fc5d514add4bd441ecfc877c67fcbb8279` is pushed to GDG-GT/main and Vercel deployment `dpl_7KMpFQKSzgdG5MCSjKD1fTRJrKL6` is **READY** on both custom domains. The RewardsWorkspace asset matches the tested local build byte-for-byte. Migrations145–147 are applied, and delivery Cron job3 is restored active and verified. No scheduler remains paused.

Owner card ending18FA was emailed through the production UI to `tejas.singhal@gatech.edu`; the job completed on its first worker attempt and Resend accepted it. The admin UI shows **Email sent**. No replacement pass was issued. The existing member balance remains0; owner-created test/revoked credentials and compensating ledger entries were preserved. No new production member, activity or points fixtures were created by this batch.

Three reusable chapter newsletter templates are saved through UI: **Chapter update**, **Event invitation**, **Event recap and resources**. Saved email preview works. No campaign or subscriber send occurred. Optional **Portfolio / website** is visible in My profile and supported in public-team editing/publication. Site content spacing and activity-category/discard dialogs were checked live.

Validation:253 test files /3002 tests; canonical and legacy DB tests145–147 including concurrency; final focused15 tests;12 final email/dialog browser cases plus56 broader mobile cases; typecheck, lint (8 inherited warnings), build, SSR, budgets and secrets passed. See [consolidated review](engineering/CURRENT_FIX_BATCH.md) and [release evidence](phase0/member-delivery-release.json). Hosted browser CI continues separately; its first code/database job stopped on a scanner publisher HTTP504. The retry-only follow-up also hit direct GitHub release gateway failures (including the Vercel ClamAV build). Added an official GitHub release-asset API fallback with pinned asset IDs, unchanged SHA-256 and streamed size limits. Linux Gitleaks and ClamAV archive bytes were independently verified;19 focused infrastructure tests passed. No scanner validation or execution was bypassed. The original READY feature deployment remains live during the follow-up build.

Temporary preview servers and Colima test VM are stopped. Auto-resume stays unloaded; no timer was created. No native binary source changed; iPhone build6 and delivered Android APK remain current. Physical NFC, biometric/device acceptance, Apple VAS and Google Smart Tap approvals remain external checks. Google Wallet publishing approval must be verified separately. No AI commit trailers. Preserve unrelated `supabase/.temp/cli-latest`.

# Current checkpoint

## Latest continuation: Android APK and QR camera focus

Owner requested Google Wallet NFC coverage and a sideloadable Android APK, with no Play Store submission. Signed APK `artifacts/android/GDG-Workspace-1.0.0.apk` is built and signature-verified, version1.0.0/build1, package`dev.gdggt.workspace`, about9.7MiB. Native navigation, biometric/Keystore sign-in, full shared admin workflows, physical NDEF read/write with blank-card/read-back checks, camera QR, uploads and bounded native export sharing are implemented. Six native policy/export tests, release lint/compile and Android15 emulator launch/form checks passed. Generated build output is outside iCloud Desktop at`~/Library/Caches/GDG GT/Android`; the release key/password stay outside Git in the private Android Signing directory. See [Android guide](operations/ANDROID_WORKSPACE.md) and [artifact record](phase0/android-apk-release.json).

QR recognition now freezes/focuses the code and dims the surrounding image before one member lookup. Stop/background/sign-out/unmount cancel pending recognition. Reduced motion is static/brief. Real decoder with a generated video QR passed in mobile Chromium; shared native navigation/a11y passed in Chromium and WebKit. Source suite250files/2990tests passed, plus focused tests after final camera scroll refinement. Public SSR and bundle budgets passed.

Google Smart Tap pass-side configuration is implemented and unit-tested but disabled by default. It requires a certified reader, authentication key/Collector ID, redemption issuer configuration and acceptance. Neither the Android APK's normal NDEF mode nor the Apple VAS reader implements Google Smart Tap. No subscription, new terminal credential or unsupported NFC activation was created. Google publishing remains In review at last verified state; direct Samsung integration remains excluded.

Prior web navigation release`6f1abd78e171b29a37860bc6b13e4cc9236c5a07` is READY and all GitHub CI jobs passed. This continuation's functional commit`151d0a17110d5a6e88a034d4c1c1fbc2a865039f` is pushed to GDG-GT main. Vercel`dpl_5JoUGUkpLxMm6nYmkQRwZ6m3foQW` is READY, aliased to both custom domains. Production RewardsWorkspace asset matched the tested local file byte-for-byte; homepage and scanner entry200, private rewards API401, all HTML/private responses no-store. GitHub run42562283603 code/database, coverage, secret and dependency gates passed; browser shards still running at this checkpoint. iPhone build6 upload already succeeded; do not upload again. Owner subsequently confirmed build6 TestFlight group assignment is done (2026-11-09). No physical-device NFC/biometric acceptance is claimed. Preserve unrelated`supabase/.temp/cli-latest`. No new timer, AI trailers, fixture production members/points, provider sends or paid resources.

## Current work: full iPhone admin app and Google Wallet

Owner requested the full admin app, Face ID, remembered sign-in and free Google Wallet setup. Owner subsequently excluded direct Samsung Wallet integration; supported Samsung phones should use Google Wallet. No Samsung account or agreement was created.

### Implemented and checked

Full SwiftUI app chrome/native sign-in, device-only biometric Keychain, native HTTP authentication, permission-filtered complete tool directory, background lock/privacy cover, download sharing and existing NFC hardware bridge are implemented. All admin pages are reachable under existing server permissions. Native navigation uses web router/draft guards. Existing workflow screens remain shared WKWebView screens, not duplicate SwiftUI editors. Face ID/device acceptance is not claimed.

Build6 is displayed as **GDG Workspace**, same bundle`dev.gdggt.scanner`, team`7THP95SRTV`, app`6832381059`. Signed archive`native/Scanner/build/GDGWorkspace-Build6.xcarchive` is development-signed with TAG only and no VAS. Xcode completed App Store distribution re-signing/upload; its upload destination did not retain a local IPA. Build6 upload succeeded at2026-11-09T03:54:33Z. **Do not upload it again.** Owner confirmed it is assigned to GDG Officers. Builds3–5 uploaded;4and5 are assigned. Build6 supersedes them with root tabs instead of website headers, native notification bell/search, proper nested Back controls, interrupted-load recovery and external link handling. No new testers or public distribution were requested.

Google Wallet QR issuance uses the existing Wallet credential, server OAuth service-account auth, stable class/object creation and short signed Save links. Member issuance stays hidden/disabled before publishing approval. Full unit suite249files/2982tests passed;18mobile rewards cases and2native-workspace browser/a11y cases passed. Final mobile profile layout wrap fix was visually checked in WebKit. Swift policy3tests, typecheck, lint, signed archive, web build and bundle budgets passed. No physical iPhone is connected for hardware acceptance.

Functional source`f3dd803e276f0337d0b69c485e26b166cd6ae9fc` is pushed and Vercel deployment`dpl_5re4fxaiFERwE144BRTF8GaLqshs` is READY with both custom domains aliased. Homepage/scanner entry200; unauthenticated private rewards/Google pass401. User reported inactive primary tabs and duplicate website controls while testing against the old companion site. The matching web companion has now deployed; follow-up native chrome refinements were pushed in6f1abd7 and deployed successfully. Added browser verification covers Events, Check-in, Members, Back, search and removal of the website hamburger in Chromium/WebKit mobile. Full249file/2982test suite passes after that refinement.

### Google setup completed, review pending

Console business`BCR2DN6DWL3IRBQG`, Wallet issuer`3388000000023239310`, Cloud project`gdg-gt-wallet` number`28621550653`; Wallet API enabled. User separately approved Console terms, Wallet API terms, and public certificate registration plus issuer Developer access. Service account`gdg-wallet-issuer@gdg-gt-wallet.iam.gserviceaccount.com` exists with no Cloud project roles and Console Developer access. Uploaded public key`58d1cf229d795c4a48c1cb8f66d976aa4aacf564` authenticated successfully; private key remains encrypted outsideGit. One Google-only preview class/object was created; no chapter member/card/points record was inserted.

Six settings are saved as production-only sensitive Vercel variables on existing project`prj_p6dWtmkiB6rk0C4fsKX4upEKxQNQ`. `GOOGLE_WALLET_PUBLISHING_APPROVED=false` remains until Google actually grants access. Publishing request176-character membership/check-in use case was submitted once and console visibly confirmed **In review** with2–3day estimate. Business profile was linked to an existing GDG@GT organization profile and is under review. Do not repeat publishing request or change identity. Owner explicitly requested the public GT student-organization office number; entered+14048943458, verified at official CSE contact page. Chapter support email`gdg@gatech.edu`, website`https://gdggt.dev`, support`https://gdggt.dev/contact` saved. No payment card, billing account or paid resource was added by this work.

Apple NFC request was submitted by the owner earlier. Apple issuer/reader approval still pending; all NFC flags stay off. Preserve unrelated`supabase/.temp/cli-latest` edit. No AI commit trailers or new timers. Production deployment/push remains authorized.

## Current release: owned iPhone scanner and writer

Owner approved an owned iPhone app after rejecting recurring scanner-service subscriptions. Use the existing Apple Developer account, private TestFlight distribution and existing Super Admin records/permissions. No more preferences or card-design questions are pending. The chosen first order is ten plain NTAG215 PVC cards for hardware acceptance; no order was placed. GT SSO and Google/Bevy/Engage remain deferred; no Google login was added. No AI commit trailers or new timers.

### Delivered software and deployment

- Native source: `native/Scanner`, SwiftUI/WKWebView with a strict first-party bridge. Physical NDEF reading/writing includes blank-card, capacity/read-only checks and exact read-back verification. Existing cards can be reopened for programming without reissuing a credential. QR camera scanning, native pass sharing and cancellation/background handling reuse the website's member/event/points flows.
- First launch opens `/admin/scanner`: existing server access-code gate, then existing account login. It has no public navigation/footer. Super Admins continue to `/admin/rewards`; expired native sessions and native sign-out return to the scanner entry. Normal browser routing and server authorization remain intact.
- Wallet VAS reader code, server-only P-256 decryption, encrypted session-bound challenges and atomic replay protection are implemented. Production Wallet NFC stays OFF until Apple issuer/reader approval and actual device acceptance. QR Wallet signing remains live.
- Source `951937ba8cccf99712e4aeda37f64f178a90b61b` is pushed to GDG-GT main. Vercel `dpl_CQUJgc4sEkhqBd8dB4Sio9buSHLY` is READY. Live ScannerEntry and workspace assets matched tested builds. A fresh private Vivaldi session visibly passed the real access-code gate and displayed email/password fields; no account password or fixture login was submitted. The temporary private window was closed. Public routes200, private unauthenticated routes401 and private reader availability=false are verified.
- Migration144 `202611080144_reward_wallet_reader` is applied locally and in production, hosted version `20261108235031`. Do not apply it again or alter142/143. RLS and explicit service-only grants were verified; anonymous/authenticated reads and RPC execution are denied. Final production card, point and replay-record counts remain zero.

### Apple app distribution complete

App **GDG GT Scanner**, ID `6832381059`, bundle `dev.gdggt.scanner`, team `7THP95SRTV`, already exists with Limited Access. Do not recreate it. Private internal group **GDG Officers**, ID `41f538c7-5b66-48dd-8719-761f0c0dcfef`, has automatic distribution OFF and only the existing Apple account owner as tester. No other person was invited and no public App Store/external-beta review was submitted. No legal agreement was accepted.

Latest beta **1.0.0 (2)** uploaded successfully at2026-11-09T00:27:11Z, processed by Apple and visibly assigned to GDG Officers. Build2 ID `7c32f47b-8370-469a-a482-0f000f9ff489`. The owner is invited. **Do not upload build2 again.** Logs: `/tmp/gdg-scanner-build2-upload.log`. Prior build1 ID `387d265f-d848-4e20-b5bb-517010c641da` is also in that group. CUA completion Published updated scanner beta was sent; the existing Vivaldi App Store Connect tab is preserved.

Signed archive `native/Scanner/build/GDGScanner-Build2.xcarchive` and distribution IPA `native/Scanner/build/TestFlight2/GDGScanner.ipa` are ignored by Git. Build2's signature, exact build number, TAG-only entitlement and non-debuggable distribution settings were verified. Signing/export/upload used the existing Xcode account and command-line automatic provisioning. Do not recreate profiles or certificates. The development profile created during initial signing is `81e53ac7-22ba-4f46-969e-18aea6fe2944`; it is outside Git. No VAS entitlement is granted.

Xcode's GUI component updater/Simulator still needs a local system-component update (installed CoreSimulator1174.9.2 vs required1174.21.0). An earlier async question asked the owner for local administrator authentication, but command-line signing/export/upload succeeded; this is **not a blocker to installing the TestFlight app**. No physical phone/card/Wallet acceptance has occurred. TestFlight builds expire after90days; an unlisted App Store release is a separate later distribution step after device acceptance. An external-beta information draft required reviewer credentials and was discarded without submission. No production Super Admin credentials were shared with Apple.

### Verification and remaining acceptance

247 test files /2,969 source tests and coverage gates pass. All72 targeted rewards/event/native-first-launch browser cases pass across six profiles; desktop/mobile entry captures were visually reviewed. Two Swift policy tests, signed Release archive/export, optional unsigned Wallet build, types, lint(8inherited warnings), web build, bundle budgets, compiled SSR and secret checks pass. Canonical DB/security tests include144 and100-client event/form capacity checks. The initial release also passed all7GitHub jobs in run42537448132. Latest source run42539646654 is COMPLETE and SUCCESSFUL: all7jobs passed, including all3full browser shards. No implementation change is queued. Documentation-only status commits do not change the tested runtime source951937b.

Remaining: owner installation and real card/QR/device acceptance; Apple contactless pass issuer and VAS-reader approval before enabling Wallet tapping; future GT provider setup remains deferred. No implementation change is currently queued. The [scanner guide](operations/IPHONE_SCANNER.md) includes exact card purchase links, writing/recovery steps, build/distribution procedures and approval gates; [verification evidence](phase0/iphone-scanner-verification.json) records the release.

A separate matching encrypted VAS P-256 key pair is prepared only in the private Wallet Issuer folder, not uploaded or activated. Preserve it. Existing QR issuer credentials remain active. No production member, credential, point, event or chapter email/push fixture send, new paid scanner account, purchase or timer was created. Only the owner's own internal TestFlight invitation was enabled. Temporary management helpers and migration/spec variables were cleared from NodeREPL memory after final verification. Preserve the unrelated uncommitted `supabase/.temp/cli-latest` marker.

## Apple Wallet QR production setup complete; device acceptance pending

The registered Apple Pass Type ID is `pass.dev.gdggt.membership` under the owner's existing team `7THP95SRTV`. The description is GDG Georgia Tech Membership. Do not register it again. An encrypted RSA signing key, its passphrase and a verified public CSR are saved outside the repository in the owner's private GDG GT Wallet Issuer folder. Do not regenerate or publish them. Public CSR copies are in Downloads as `GDGMembership.certSigningRequest` and `gdg-membership.csr`.

The owner supplied `/Users/tejas/Desktop/pass.cer` after completing Apple issuance. It matches the existing encrypted private key, Pass Type ID and Apple team. Its validity ends 2027-12-08 22:18:39 UTC. The official Apple WWDR G4 and Apple Root CA chain was verified. A real signed QR-only test archive was generated locally and its manifest/CMS signature verified against that root; the test credential is not registered in production. No duplicate certificate was requested.

All nine Wallet settings are saved as production-only sensitive/write-only variables on the existing GDG-GT Vercel project. QR is enabled; NFC and reader verification remain false. Private keys and passphrase stay outside Git, with the private key encrypted. Activation commit `865ef400868845f8e011d81c102341cb548ed4f9` is pushed and Vercel deployment `dpl_9ydjbZkorBkB6YF3ub8VWDUJMdkL` is READY. The authenticated production rewards API was visibly verified through the existing Super Admin Vivaldi session: `walletAvailable=true`, `walletNfcAvailable=false`. Public homepage/leaderboard remain HTTP 200; unauthenticated private pass download remains 401. Do not repeat issuance, secret uploads or deployment setup. The read-only verification tab is separate from the original profile tab. Do not issue a fixture production member or send participant email.

The app now supports explicitly enabled QR-only passes without an NFC entitlement or reader, retains the contactless setup gate, and verifies the signing certificate against its WWDR issuer. Super Admins can download existing active-member Wallet credentials from the rewards workspace; members retain their own GT-session download path. Downloads check active membership and revocation again after signing and are private/non-cacheable. QR passes are scanned with the existing iPhone PWA camera. No member login fallback, fixture production member, automatic provider send or Wallet push service was added.

Software commit `9aa67cb192f5ec3d91a80b5eb508a940c263e0a8` is pushed to GDG-GT main and Vercel deployment `dpl_GrrSy5pobcHBiiV9wNCRTJi5H2PU` is READY. The live Wallet workspace asset matches the tested local build byte-for-byte. Production public routes and the unauthenticated private-download rejection were checked without production writes. This first software deployment predates issuer configuration; the later activation deployment listed above includes the verified issuer.

Software verification passed: 2,943 source tests and all coverage gates, 60 rewards/event browser cases across six profiles, types, lint with eight inherited warnings, build, bundles, compiled public SSR and secret scan. A read-only local PostgREST query verified the active-member credential join against the real schema. Evidence: [phase0/apple-wallet-qr-verification.json](phase0/apple-wallet-qr-verification.json). Desktop/mobile WebKit pass downloads are verified after adding the explicit download attribute.

The active production directory currently has zero community members and zero credentials. Add a real member through Members, select them in Points & cards, issue Apple Wallet QR and download the signed pass. No production fixture/member/credential/point was created during setup. The remaining acceptance step is a real iPhone Add to Wallet, PWA scan and duplicate/revocation check. Member self-service login remains deferred with GT SSO; Super Admin downloads are available independently. The local signed test pass proves packaging/signing, not real membership or iPhone acceptance. Keep contactless flags off.

## Completed maintenance task

Owner request: create detailed documentation for separate-event NFC/membership integration; clean obsolete docs, other repository clutter and proven dead files without changing functionality.

The detailed guide is [operations/EVENT_MEMBERSHIP_INTEGRATION.md](operations/EVENT_MEMBERSHIP_INTEGRATION.md). Documentation is grouped under operations, planning, engineering and verification; the [index](README.md) is the entry point. Obsolete guides and unused historical snapshots are retired. Their previous tracked versions remain in Git; a private pre-cleanup recovery copy also exists outside the workspace. Cleanup verification is recorded in [phase0/repository-cleanup.json](phase0/repository-cleanup.json).

Preserve existing user edits, local credentials/databases, current assets, dependency lock, canonical and original audit migrations, and runtime behavior. No AI commit trailers. No new timers. No deployment-account reprovisioning, purchases or participant/provider test sends for this maintenance task.

## Published feature release

Commit `933a70f13f6c1f2913c41b89ec16c698c10dbc8f` is deployed to production. Vercel `dpl_JBjLwxDeRTGfbipFfoLDwX1C6qGq` is READY. GitHub workflow [42519848592](https://github.com/GDG-GT/gdg-gt-website/actions/runs/42519848592) passed all seven jobs: 2,929 source tests and 2,012 browser cases, with 10 existing viewport/WebGL skips. Targeted rewards/event browser checks: 54/54 across six profiles. See [live release evidence](phase0/event-membership-live-release.json).

The production Super Admin Event connections screen was verified in the existing Vivaldi session, in a new review tab. No connection form was submitted, no key generated and no production event/card/attendance/point test records created. The original browser tab was preserved. The CUA completion summary was sent. No browser preferences or pending update were changed.

## Integration behavior to preserve

- Chapter owns community identity, credentials, points and perks; separate events own registration details and attendance.
- Event-scoped server keys, pseudonymous per-event member references and one-time linking codes.
- Live event registration callback, explicit officer confirmation and duplicate-safe attendance recovery.
- Chapter points require a separate Super Admin action.
- Member code acquisition uses GT member SSO; Google sign-in is excluded.
- The public board exists only at the leaderboard subdomain root; main-domain leaderboard/member pages are 404.
- iPhone uses physical NDEF URL handoff; Android Web NFC and QR share the existing scanner path. Do not promise iPhone PWA raw NFC or contactless Wallet acceptance without issuer/reader prerequisites.

## Database and runtime state

Canonical migrations 142 and 143 are finalized and applied locally and in production. Do not edit/replay them.

| Canonical migration | Hosted history version |
| --- | --- |
| `202611080142_member_rewards` | `20261108174406` |
| `202611080143_reward_event_connections` | `20261108201706` |

Migration 143's six tables have RLS enabled, no anonymous reads or authenticated writes, and explicit service-role grants. Last release checks found zero production event connections, event check-ins, cards and ledger entries. Existing owner setup, storage and provider configuration must not be repeated.

The local UI/API normally use 8080/8081; inspect `npm run local:status` before starting anything. Colima profile/context is `gdg-gt` / `colima-gdg-gt`. The generated target migration folder is ignored. Private `.env` and `.docs/*.local` state stays in place. Temporary management-token variables from publication were cleared; no runtime keys were revoked.

## External setup and boundaries

- GT institutional/provider approval and actual GT login validation remain external setup. Member OIDC code exists behind its flag. Admin/Form SSO remain separate planned integrations.
- Future event websites must install/configure their adapter/schema and registration/linking UI. Creating a chapter connection does not provision another site.
- Apple Wallet issuer credentials, enhanced contactless entitlement/reader configuration and real device checks are separate requirements.
- GDG community/GT Engage remains research. Do not add Google login.
- Full human visual/screen-reader/device/production-soak acceptance is not inferred from automated CI.
- Vivaldi external-open rendering was closed by the user's determination; do not resume that investigation without a new request/evidence.

Use [implementation status](IMPLEMENTATION_STATUS.md), [production status](PRODUCTION_LAUNCH_STATUS.md), [PRODUCT.md](../PRODUCT.md) and the current source for further decisions. Old intermediate reports do not authorize repeating external actions.

## Cleanup verification

14 superseded guides,116 unused snapshots,134 unreferenced review images, two unimported conflict source copies and the empty SECURITY_FIXES.md were removed. 150 maintained notes were grouped into operations/planning/engineering/verification. About5.81GiB of generated artifacts and superseded dependency/font backups were removed; the current browser report and active dependencies remain. Private pre-cleanup recovery copy identifier:20261108T205530Z under ~/Library/Caches/gdg-gt-website-cleanup. It includes pre-existing uncommitted notes and the removed source copies; do not publish its private local credential files.

All820 fingerprinted tracked runtime/configuration files remain byte-identical; all5 normative specification/audit/design documents remain byte-identical. Rebuilt server-rendered output is identical. Two production stylesheets and16 production entry/preload scripts match the rebuilt local files byte-for-byte. Local pre-cleanup client hashes changed because the unused source copies contributed unused Tailwind selectors; the rebuilt artifacts match production.

Full243file/2929test coverage run passes with unchanged gates; types, lint(8inheritedwarnings), build, bundle budgets, compiledSSR, traceability and232localMarkdownlinks pass. No database reset, provider mutation/send, new event configuration or feature changes were performed. Final staged secret scan passes with0unreviewedfindings. The documentation/cleanup was published to GDG-GT main in commit e098520, without AI trailers. No runtime feature changes or further cleanup operations are queued.
