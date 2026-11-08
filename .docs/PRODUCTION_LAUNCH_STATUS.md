# Current production launch status — November 8, 2026

Canonical site: https://gdggt.dev. Source: https://github.com/GDG-GT/gdg-gt-website.
The owner explicitly authorized production deployment, real chapter content and
free-only configuration. The repository is public by the owner's choice.

Configured and actually verified:

- Vercel Hobby / Node 24 / Fluid compute, linked GDG-GT main, own Cloudflare domain.
- Supabase Free: 141 forward canonical migrations; six private buckets; existing
  table RLS and explicit service privileges. No sample content imported or DB reset.
- Corrected first Super Admin created exactly once, all privileges; setup email
  delivered with real signed provider callbacks. The user owns the setup link.
  Actual authenticated reads passed all 12 checked admin screens.
- Resend sender/domain and exact raw-byte webhook verified with real delivery and
  signed email.sent/email.delivered callbacks. User-confirmed contact/reply inbox:
  gdg@gatech.edu. No random human or participant test sends.
- Isolated hosted native ClamAV accepts clean content and rejects EICAR; private
  media metadata reader and both S3 bucket round trips pass on gdggt.dev. All
  owned technical objects from those runtime checks were removed.
- Queue-driven private upload/media/export dispatcher installed with minute recovery;
  it avoids HTTP when no work is due. Daily encrypted deployment hook refreshes
  signed antivirus definitions; stale signatures fail closed.
- Owner explicitly accepted 50 MiB video/export limit to stay completely free.
  Smaller purpose/category limits remain. Free quotas still apply.
- The deployed ca70c3e CI run passed every source/database, dependency, coverage,
  secret and all three browser shards. New worker source passes 2,807 full tests
  with all original coverage gates. Latest content/navigation CI remains separate.

Latest deployed release: 35eca74 (Vercel READY/PROMOTED).

- Navbar links and bar are centered. Local 4-browser geometry and mobile menu
  checks pass; actual canonical desktop/mobile geometry also passes.
- Chapter links are published at https://gdggt.dev/links and /l/gdg-gt: 9 active
  factual chapter links, with executive-board application featured first.
- https://gdggt.dev/forms/executive-board-application is Open: four sections,
  13 questions, required name/email and accuracy consent, optional 10 MiB PDF,
  180-day private retention, review step and optional exact response copy.
  No deadline or specific role vacancy was invented. No test application submitted.
- Actual queued clean upload -> remote native scan -> fenced promotion -> exact
  private download passes. Standard EICAR is rejected MALWARE_DETECTED. The two
  owned private test files were archived normally; retention governs their bytes.
- Actual empty application export -> automatic worker -> private signed download
  -> cancellation -> automatic artifact deletion passes. No fake answers inserted.
- Both existing transactional/campaign mail schedules are now active. Push is
  configured with dedicated VAPID; actual physical-device notification acceptance
  remains separate. The owner-confirmed inbox/reply-to is gdg@gatech.edu.
- Actual public browser sweep: 18 checks across nine routes, zero page errors.
  New home/links/application desktop/mobile sweep: 10 checks, zero page errors,
  business writes or CSP reports. Four rendered link/application WCAG A/AA checks
  including contrast pass. Actual authenticated sweep: 12 admin pages, zero page
  errors, business mutations or CSP reports. The temporary verification session
  was then revoked and its in-memory password/cookies cleared. Hero: 7 real checks pass, including
  immediate WebGL, no static poster flash and three distinct moving frames.
- Complete CI run 42431411815 for deployed source 35eca74 is SUCCESS. All three
  broad browser shards and source/database/coverage/dependency/secret gates pass.
  The run passes 2,808 source tests / 231 files and 1,808 browser checks, with
  10 expected profile skips. See phase0/production-ci-final.json.

The complete local backup/restore rehearsal also passes at 141 migrations,
including all retained-data fingerprints and security catalog/permissions. Its two
owned disposable databases were removed. This is not a hosted recovery claim.

Final isolated lab performance passes the mobile homepage at about 1.95 seconds
LCP (99 performance, 100 accessibility) and the desktop homepage at about 0.65
seconds (100/100). The earlier mobile 2.72-second miss is retained separately in
phase0/production-performance-release-first.json; its slower machine benchmark
and server timing prompted the isolated diagnostic and full rerun. No gate,
assertion, throttling setting or source code was changed to obtain the rerun.

Remaining acceptance is specific: physical-device
install/push; manual screen-reader acceptance; hosted recovery/rollback drill;
and the elapsed 48-hour observation window. These are not established by local
unit tests or a Vercel Ready badge. SSO/Google and Bevy/Engage remain deferred.
No paid service or new account was needed for the live worker architecture.

The Supabase-owned net extension retains its managed SQL grants, but actual
anonymous Data API reads reject both request queue/response tables with
406/PGRST106 because net is excluded. Never expose net or Vault to the Data API.
Temporary management tokens are not runtime dependencies. Keep dedicated sender,
S3, VAPID and signing credentials when expiring setup access. No new hosting
account or paid service was required.

--- Historical launch findings follow; newer evidence above supersedes them. ---

# Production launch status

The owner authorized GDG-GT GitHub push and production deployment on November 7,
2026. The source is now public at https://github.com/GDG-GT/gdg-gt-website. The
canonical domain is https://gdggt.dev. A deployment marked Ready by Vercel is not
an application acceptance result; actual failed hosted checks are retained.

## Configured

- Vercel GDGGT project `gdg-gt-website`, Node 24; canonical Cloudflare DNS points
  to its assigned Vercel target. Existing nameserver, email and TXT records remain.
- Supabase Website project: all 140 canonical migrations, 121 tables with RLS,
  no source/sample users or content imported. No existing local database reset.
- Independent server secrets, imported ES256 signing key, dedicated domain-scoped
  Resend sending key, verified sender domain and signed Resend webhook.
- Four private buckets and a dedicated S3 key. The S3 key was created after the
  owner's explicit approval and transferred through private UI memory into
  Vercel Production Secret entries; its values were not logged or committed.
- Read-only canonical-host checks in `scripts/test-hosted-readiness.mjs`.

## Actual hosted findings

The first deployment omitted imported shared TypeScript files, so API and document
functions failed at startup. Explicit inclusion repaired startup. The next actual
checks found that the public static index bypassed root SSR, named rewrite captures
prevented full public rendering, and nested API dispatch needed a standalone
function adapter. Current corrections package static assets without the public
index and use a literal renderer import for dependency tracing. They preserve the
private template with its server function. Actual rerun results, rather than this
implementation description, determine readiness.

The first GitHub run passed source, database, coverage, dependency and secret gates.
It also exposed a Firefox container home-ownership failure and two mobile inquiry
focus/target-size failures. The workflow now installs its exact Playwright browsers
on the Ubuntu runner. Inquiry recovery returns focus to the verified record and
aligns its panel below the toolbar; 60 related six-profile browser checks pass.
Superseded runs remain recorded; a fully passing remote browser run is still needed.

## Inputs and operating requirements still outstanding

- First production owner email/display name and first-owner sign-in verification.
- A persistent host for private scanner/upload/media/export workers, followed by
  their actual hosted transport/scan/lease/recovery checks. No new paid host is
  purchased without the owner's choice.
- Storage capacity: the current Supabase Free project has a fixed 50 MB limit;
  the configured 64 MB export and 250 MB media buckets are rejected. The original
  product limits have not been silently reduced. A capacity or hosting decision
  is required before those upload paths can be enabled.
- Authenticated scheduled jobs, live delivery and signed webhook smoke checks,
  actual-device install/push, hosted backup/restore/rollback and observation.
  Human assistive-technology acceptance remains unproved by the native tool.

The owner subsequently made the repository public and connected GDG-GT/main to
Vercel. The live Git link is verified; future main pushes deploy automatically.
The earlier private-organization Hobby rejection is historical. No plan was purchased.

SSO/Google and Bevy/Engage remain deferred. The temporary provider-management
credentials are not runtime dependencies. Keep the newly created runtime sender,
S3 and signing credentials when revoking temporary setup access.

## November 7 live recovery and hero startup

The canonical site serves usable public pages again: actual anonymous browser
checks passed on nine routes at desktop/mobile sizes (18 checks, no page errors).
Server-rendered HTML acceptance still fails at renderer-load; it is not marked
complete. The live fallback requires a fresh verified live availability snapshot.

The desktop hero now starts the real 3D scene immediately after capability detection,
without waiting for input or the old 1.2-second timer. Its pending desktop poster
is hidden before hydration, and its module-loading fallback is empty, so a different
object design never flashes first. Reduced-motion, mobile and constrained devices
retain the static scene; unsupported WebGL has a fallback. Eight browser cases pass
with four existing non-applicable software-WebGL skips, and the actual loopback
moving-frame/fallback check passes. Final hosted verification follows deployment.

## Verified production repair and operating jobs

The router runtime was missing from the Vercel function. Bundling the two router
packages repaired server rendering; 34/34 canonical HTTPS checks pass, including
real SSR/hydration, API dispatch, anonymous rejection and private-file exclusion.
Seven actual canonical hero checks pass: automatic 3D startup, no poster flash,
three distinct moving frames, reduced-motion/mobile fallbacks and no page errors.
All 2,772 source tests and existing coverage gates pass. Final six isolated
performance checks pass (home mobile99/desktop100, accessibility100, CLS0);
PWA boundaries15 and update9 checks pass on the final build. These are lab and
functional checks, not physical-device or 48-hour acceptance.

Supabase Cron/pg_net and encrypted Vault now support eleven HTTPS job definitions.
Nine verified no-send job routes are active; delivery and newsletter remain
inactive while email is disabled. One real transport test to the Resend simulator
was delivered by Resend, but the callback exposed Vercel's JSON body helper.
`NODEJS_HELPERS=0` is configured for the next build; signed webhook acceptance
is still pending actual redeployment/verification. No human recipient was sent
a test message. Provider simulator tests consume the normal sending quota.
