# Production launch status

The owner authorized GDG-GT GitHub push and production deployment on November 7,
2026. The source is private at https://github.com/GDG-GT/gdg-gt-website. The
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

Vercel Hobby rejected automatic Git linking for this private organization-owned
repository (`repo_owned_by_org`). Pinned Git-source deployments work. The repository
has not been made public and no Vercel plan was purchased.

SSO/Google and Bevy/Engage remain deferred. The temporary provider-management
credentials are not runtime dependencies. Keep the newly created runtime sender,
S3 and signing credentials when revoking temporary setup access.
