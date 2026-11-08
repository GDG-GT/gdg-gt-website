# Current checkpoint

## Current task: owned iPhone scanner and writer

Owner explicitly approved building our own native iPhone app after rejecting paid scanner subscriptions. Use the existing Apple Developer account, private TestFlight distribution, existing Super Admin web sign-in and records. User delegated card quantity/design and distribution decisions; no further clarification is pending. No purchases or subscriptions. Build physical NDEF reading/writing, existing QR scanning, and approval-gated Wallet VAS reading with server-only decryption. Preserve current issuer setup and keep production Wallet NFC flags off until Apple approval and real-device acceptance. Native app uses a narrowly scoped trusted-origin bridge to the existing rewards workspace; no second membership database or auth system. Research finished US PVC cards and provide purchase links. No AI commit trailers, timers, production fixture records or real test sends.

The website bridge, native SwiftUI/WKWebView app, NDEF reader/writer with blank-card refusal and read-back verification, existing-card programming recovery, native QR camera and pass sharing, optional VAS reader, server-only VAS decryption/challenges and DB replay protection are implemented. Source is `native/Scanner`; the [iPhone scanner guide](operations/IPHONE_SCANNER.md) covers builds, card purchase links, installation and the hardware/Apple acceptance gates.

Verified: 246 test files / 2,964 tests with coverage gates, all canonical migrations and DB tests including 144 plus 100-client registration/form checks, 60 existing rewards/event browser cases plus 6 new native-bridge cases across six browser profiles, typecheck, lint (8 inherited warnings), web build, bundles, compiled SSR, secret scan, 2 native Swift policy tests, unsigned Release and Wallet device builds and an unsigned iPhone archive. One earlier coverage run hit an unrelated form-test timeout under concurrent native compilation; that test and a complete lower-concurrency coverage run then passed. The new browser test's original ambiguous locator was corrected; all six profiles pass. No test failure remains hidden as a pass.

Production migration 144 is applied once and recorded as hosted version `20261108235031`, name `202611080144_reward_wallet_reader`. RLS, denied anonymous/authenticated reads and execute, and zero replay/point records were verified. Local migration 144 is also applied without resetting any data. Website release `3bc4a3a4a480c1bf3319a06a4d8ee14dd4692350` is pushed to GDG-GT main; Vercel `dpl_FXdDa1Vk1jnkRpyh5fbSytUiGEqd` is building and GitHub run42537335952 is in progress; do not apply the migration again. Existing checkpoint/Wallet evidence/research edits are preserved. `supabase/.temp/cli-latest` is unrelated and must stay unstaged.

Unsigned archive: `native/Scanner/build/GDGScanner.xcarchive` (ignored, about 2.1 MiB). Xcode's required system component update is stalled waiting for other installation work; installed CoreSimulator1174.9.2 is older than Xcode's required1174.21.0. CLI noninteractive installation confirms macOS administrator authentication is required. No provisioning profiles exist locally. TestFlight upload, signed-device installation and real card/Wallet acceptance are NOT complete. Do not claim these from unsigned compilation or simulated bridge tests. A separate matching encrypted P-256 VAS key pair is prepared outside Git in the private Wallet Issuer folder, not uploaded or activated. QR signing stays live and all production NFC flags stay off. No production member, credential, award, provider send, purchase, new timer or paid scanner account was created.

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
