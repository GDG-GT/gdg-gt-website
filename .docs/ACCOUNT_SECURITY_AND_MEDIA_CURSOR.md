# Account security, Operations recovery, media cursors and runtime packaging

The fresh audit found local gaps that earlier status messages understated. They
are now implemented. This is a local implementation checkpoint, not a claim that
the full PRD or launch acceptance is complete.

- `/admin/users` has a Super Admin account-security disclosure: current safe
  aggregate metrics, gate version/time and a reviewed rotation workflow. Rotation
  requires a current password, repeated new code, typed consequence confirmation,
  current gate version and an idempotency key. The transaction rechecks role,
  session, password and version; old gate passes are revoked immediately. Existing
  signed-in sessions remain active and can be revoked in the account directory.
  Lost output is inspected using a current-session receipt; no automatic second
  rotation occurs and a retry requires fresh password entry. Secret material is
  never stored in browser persistence or returned in responses. The superseded
  unreviewed database mutation is no longer executable by service_role.
- Operations uses the shared private-read recovery and account/session isolation.
  A current 401/403/404 clears the old snapshot. Temporary failures retain an
  explicitly stale snapshot. Refresh can restart a stuck read; offline refresh
  is fenced. The original audit failure is preserved separately in ignored
  `artifacts/browser/release-audit-20261107`.
- Media uses opaque timestamp/UUID cursors with stable creation order, explicit
  backward history and filter reset. Database permission checks apply on every
  page. Tests cover tied timestamps, concurrent inserts, metadata edits and
  revoked sessions. The old internal RPC remains for historical callers/tests;
  the application API and UI use the new cursor contract.
- Production worker/scheduler and initial-owner commands are available with
  network-free plan modes. See [PRODUCTION_RUNTIME.md](PRODUCTION_RUNTIME.md).
  Bootstrap refuses any existing account, and no production command was executed.
  The optional Vercel API adapter allows 60 seconds for the existing 40-second
  retention budget. Resend webhook configuration is documented in `.env.example`.

Migrations 138–140 were applied forward once to the dedicated local database.
The complete isolated database suite passes, including new gate/cursor/bootstrap
assertions and both 100-client last-slot concurrency checks. A new 140-migration
backup/restore proof also passes. No local accounts or gate secret were changed;
transactional local gate/cursor fixtures rolled back, and destructive bootstrap
fixtures ran only in the disposable database.

Complete source verification passes 2,743 tests in 225 files. Global coverage and
all pre-existing critical branch gates pass; the new security route has 100%
branch coverage and now has its own 90% gate. Types, build, bundles, lint (zero
errors; ten inherited warnings), traceability mapping and secret scan pass.
All 18 new browser checks pass across six profiles. The first mobile capture
exposed heading spacing, corrected with scoped styles and retested separately.
These captures are unapproved review evidence, not visual goldens.

The later PUBLIC_RENDERING_AND_RELEASE_CHECKS.md supersedes these counts:
mobile LCP and the complete current browser run now pass.
Manual accessibility, physical-device install/push, owner visual/content approval
and chosen-host acceptance remain distinct. Own hosting/domain and Resend are the
owner's decisions; live keys are launch inputs. SSO/Google and Bevy/Engage stay
deferred. No new timers, external sends, deployment or AI commit trailers.
