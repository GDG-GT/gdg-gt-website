# Local HTTPS and configured security headers

`node scripts/test-production-security-headers.mjs` serves the real production
build through an owned HTTPS loopback server. It uses the exact configured
common header values in `vercel.json`, including CSP and
`upgrade-insecure-requests`. Its ephemeral one-day certificate is accepted only
by the isolated test context; it is never installed into an operating-system or
browser trust store. The context, listener and temporary certificate/key directory
are closed/removed in the final cleanup.

All 45 checks pass locally. Home, Events, Contact and Privacy render with no page
exceptions or unexpected CSP violations. Deliberately injected inline scripts
are blocked on every route. Their four browser-generated reports terminate in
the owned test server without reading or retaining report bodies; no report is
forwarded to the application API, database or a provider. The probe also verifies
worker/manifest/API cache headers and actual hashed-bundle/artwork/font responses.
All other non-read methods and all external requests are refused. No account,
private record, credential, real application write or provider send is involved.

The first probe correctly blocked inline execution but its harness also refused
the resulting browser CSP-report POSTs. That failure is preserved as
`phase0/production-security-headers-initial-report-refusal.json`. The corrected
harness has an explicit no-op local report sink; neither the CSP nor the
application reporting route was weakened to make it pass.

The cache review found stable artwork/font filenames under the blanket one-year
immutable asset rule. Such URLs can change without a new filename. Configuration
now gives only emitted eight-character-hashed JS/CSS the immutable lifetime;
remaining assets revalidate. Three source-policy tests check positive/negative
filename boundaries, exactly one matching cache policy, and exclusion of public
documents, private HTML and APIs. The HTTPS probe checks the resulting responses.
The route patterns use the documented configuration syntax; see
[Vercel's header configuration](https://vercel.com/docs/project-configuration/vercel-json#headers).
Actual provider pattern parsing and deployed header precedence still require
staging verification.

This is local enforcement evidence. It does not certify hosted TLS, production
certificates/domains, exact CDN behavior, header ordering at the provider, allowed
external embeds/connect origins, authenticated editors, WebGL, service workers,
all role workflows or actual monitoring/alert delivery. `OPS-TEST-002` remains
unverified against its full hosted acceptance definition.
The PRD's report-only staging rollout is still required before production
enforcement; this isolated enforced-policy probe is not a replacement for it.
