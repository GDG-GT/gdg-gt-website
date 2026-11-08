# Critical transport and validation test coverage

Local quality checkpoint, 2026-10-22. No runtime protection or coverage exclusion
was weakened. The complete PRD/CI coverage gate is still failing.

The initial checkpoint added 27 tests for authenticated encryption, private object-storage transport,
scanner protocol/failure handling, shared API validation and additional upload
formats/unsafe content. At that checkpoint all 437 units passed; strict types, lint (0 errors/245
warnings), production build and public/offline byte gates passed.

The object-storage tests use actual AWS command/presigner contracts with an
injected SDK transport, not a real provider. Scanner tests use an isolated local
TCP protocol peer and injected connection/write/timeout failures; that peer is
not a malware engine. Separate actual ClamAV/EICAR/private storage/cleanup
integration remains covered by the real local upload suite (124 checks).

Encryption covers nonce independence, all malformed envelope parts, wrong keys,
authentication tags/AAD and invalid decrypted JSON. Upload-content tests include
actual PNG/WebP normalization, PDF signature contract, typed UTF-8, malformed and
wrong-type archives, traversal/entry-count limits and unsafe/undecodable images.
Database errors and malformed query/idempotency input fail without private details.

## Measured V8 result

All source remains included, including unimported preserved historical screens.
Separate HTTP/SQL/manual browser processes are not instrumented by this report.

| Critical module | Line coverage | Branch coverage |
| --- | ---: | ---: |
| auth | 100% | 98.52% |
| authorization | 100% | 100% |
| security | 100% | 100% |
| HTTP primitives | 100% | 100% |
| encryption | 100% | 100% |
| object storage | 100% | 100% |
| scanner transport | 100% | 100% |
| input/database validation | 100% | 100% |
| upload content | 100% | 98.86% |
| Realtime signing | 87.5% | 91.48% |

The initial checkpoint passed ten of seventeen individual critical-file gates,
with 11.47% overall lines and 11.44% branches. Those figures are historical, not
the current result below, and are not percentages of features implemented.

## Current route checkpoint — 2026-10-22

Added **91 request-dispatch tests** for account access/users, scoped person-data
operations, finance, Forms library/authoring/access, public submissions/resume/
editing and private uploads/downloads. Replaced one obsolete projection-helper
test with live-handler tests: **531 tests across 93 files now pass**. Strict
types and lint pass (0 errors/245 warnings). The actual local Forms suite also
passes all **124 HTTP/database/private-storage/ClamAV/cleanup checks** after the
cleanup below; the production build and public/offline byte gates pass.

The new units execute `applicationHandler`, real request parsing, authorization,
CSRF, Zod schemas, cryptography and AWS command/signature construction. Database
and provider transports are injected contracts, not proof of real database RLS,
transaction races or hosted storage. The Forms fixture honors explicit SELECT
columns instead of returning undeclared fake columns. Mail configuration is
loopback-only in these tests; no real messages/provider sends are performed.
The separate local integration suite supplies real database/storage/scanner
evidence; it is not counted toward instrumented V8 coverage.

Removed the shadowed legacy response branch and its unused `projectResponse`
export from `server/forms.mjs`: `applicationHandler` already dispatches all
responses/analytics/views to `formResponseRoutes` first, using the scoped
`read_form_responses` transaction. The live reader was not missing respondent
identity. New dispatch tests cover that canonical path, response/sensitive
permissions, scoped filters and identifier-only audit records; the real local
suite confirms default sensitive masking and separately authorized reveal.
Authoring routes also no longer accept meaningless trailing child segments.
No feature or coverage exclusion was added to make the gates pass.

| Remaining critical route modules | Line coverage | Branch coverage |
| --- | ---: | ---: |
| access | 100% | 100% |
| users | 100% | 98.68% |
| Forms | 100% | 99.67% |
| Forms access | 100% | 98% |
| uploads | 100% | 98.83% |
| finances | 98.78% | 97.72% |
| person privacy | 100% | 100% |

Together with the ten modules above, **all 17 individual 90%-branch gates pass**.
Overall coverage remains **13.86% lines, 14.26% branches, 13.71% statements and
8.81% functions**. All source, including preserved historical screens, remains
included. The complete PRD/global 70% gates **still fail**, so
`npm run test:coverage` correctly exits nonzero and CI must not call it green.
HTML/full JSON reports are generated in ignored `coverage/`. These measurements
do not close manual accessibility, supported-device, performance, visual,
hosted security or launch acceptance, or complete PRD implementation.
