# Current checkpoint

## Apple Wallet QR setup in progress

The registered Apple Pass Type ID is `pass.dev.gdggt.membership` under the owner's existing team `7THP95SRTV`. The description is GDG Georgia Tech Membership. Do not register it again. An encrypted RSA signing key, its passphrase and a verified public CSR are saved outside the repository in the owner's private GDG GT Wallet Issuer folder. Do not regenerate or publish them. Public CSR copies are in Downloads as `GDGMembership.certSigningRequest` and `gdg-membership.csr`.

The Apple certificate wizard was prepared with the name GDG Georgia Tech Membership QR. The file picker would not enable Open; subsequent browser control lost its window connection and returned a blank capture. No certificate issuance or download was verified. No production signing environment was changed. On resumption inspect Apple Certificates and local certificate downloads before repeating an action. Reuse the existing CSR/key pair. Issuing a signing certificate through the browser requires action-time confirmation under the computer-use policy.

The app now supports explicitly enabled QR-only passes without an NFC entitlement or reader, retains the contactless setup gate, and verifies the signing certificate against its WWDR issuer. Super Admins can download existing active-member Wallet credentials from the rewards workspace; members retain their own GT-session download path. Downloads check active membership and revocation again after signing and are private/non-cacheable. QR passes are scanned with the existing iPhone PWA camera. No member login fallback, fixture production member, automatic provider send or Wallet push service was added.

Software verification passed: 2,943 source tests and all coverage gates, 60 rewards/event browser cases across six profiles, types, lint with eight inherited warnings, build, bundles, compiled public SSR and secret scan. A read-only local PostgREST query verified the active-member credential join against the real schema. Evidence: [phase0/apple-wallet-qr-verification.json](phase0/apple-wallet-qr-verification.json). Desktop/mobile WebKit pass downloads are verified after adding the explicit download attribute.

Finish certificate issuance/download, verify the downloaded certificate matches the existing private key and Apple team/pass identity, obtain and validate its official WWDR intermediate, configure only encrypted server environment values on the existing Vercel project, then enable QR issuance. Keep contactless flags off. A real iPhone Add to Wallet and check-in/revocation test remains necessary; fictional-certificate cryptographic tests do not establish Apple acceptance.

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
