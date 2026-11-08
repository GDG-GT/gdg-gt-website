# Patched validation dependency — 2026-10-24

The fresh production audit identified high advisory
[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), updated
2026-10-23. The old Zod 3.25.76 dependency is affected. Updated the exact direct
dependency and lockfile to Zod 4.6.7, without disabling audit or weakening the gate.

Compatibility changes follow the [official migration guide](https://zod.dev/v4/changelog):
explicit record key/value schemas, refinement-bearing object shape access,
`ZodError.issues` and pre-parse defaults for member export filters. Existing API
payload bounds, CSRF, permissions and strict unknown-property rejection remain.
Added regression checks for oversized constrained-array early rejection and safe
whiteboard record validation. No bundled Zod 3 compatibility import was introduced.

584 units and strict application/build TypeScript pass. The actual 124-check
Forms/private storage/ClamAV suite passes. Actual CMS, member CSV transfer and
maintenance checks pass. After natural local login-quota expiry, native whiteboard
HTTP/private WebSocket regression also passes; the limiter was not reset or
bypassed. Production audit: 0 critical, 0 high, 2 moderate, 4 low.

The project dependency cache is isolated outside the Desktop/iCloud workspace.
The prior Zod package was recoverably moved to a separate cache backup before
installing the patched package. Vite was restarted with forced dependency
re-optimization. Its watcher now ignores generated coverage/preview reports and
backend-only files, preventing report generation from repeatedly reloading pages.

This checkpoint does not close full dependency, hosted load, accessibility or
launch acceptance. Re-run the production audit and full gates before deployment.
