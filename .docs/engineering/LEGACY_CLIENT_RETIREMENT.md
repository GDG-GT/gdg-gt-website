# Retired browser implementation

The active Georgia Tech application uses protected HTTP APIs and a dedicated
scoped Realtime client. On 2026-10-24, 130 superseded screens, components and
services were removed after checking imports from both HTML entry points, all
active routes, tests, scripts and existing untracked source. Shared design
primitives and their dependencies remain. The current dynamic hero, standalone
offline document, response workspace and every routed workflow remain.

The PSU reference is preserved in commit
`962e634aaf3fc499013fd7c722bad4371775eff8` and local tag
`reference/psu-client-before-retirement`. Git can display any retired file with
`git show reference/psu-client-before-retirement:path/to/file`. The path/hash
manifest is `../phase0/legacy-client-retirement.json`. Historical SQL and the original
Phase 0 source inventory are unchanged. No remote repository was modified.

Browser-serialized domain types now live in `src/lib/chapter-types.ts`; they do
not include password hashes or instantiate an anonymous database client. The
import-graph regression checks both HTML roots, the dynamic hero and the current
response workspace. A separate AST check rejects direct browser database calls
and SDK initialization outside the scoped Realtime transport.

Verification: 611 tests pass; strict TypeScript, production build, public byte
budgets and traceability structure pass. Lint has zero errors/36 warnings
(including one existing untracked user file); the former 245-warning ceiling is
reduced to 36 in CI. Public entry JavaScript is 198,197 gzip bytes; its CSS is
33,885 gzip bytes; fonts total 48,432 bytes. Runtime Web Vitals remain unverified.

Overall measured unit coverage is 26.73% lines/25.45% branches. Removing dead code
changes the denominator; it does not establish additional behavioral coverage.
All 17 critical-file branch gates pass, and the unchanged global 70% gate still
fails. No coverage exclusions or thresholds were loosened. This cleanup does not
approve visual fidelity, staging or release, or complete the PRD.
