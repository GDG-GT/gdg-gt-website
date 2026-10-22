# Critical transport and validation test coverage

Local quality checkpoint, 2026-10-22. No runtime protection or coverage exclusion
was weakened. The complete PRD/CI coverage gate is still failing.

Added 27 tests for authenticated encryption, private object-storage transport,
scanner protocol/failure handling, shared API validation and additional upload
formats/unsafe content. All 437 units pass; strict types, lint (0 errors/245
warnings), production build and public/offline byte gates pass.

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

Ten of seventeen individual critical-file 90%-branch gates now pass. Seven
route modules remain below that threshold: access, users, Forms, form access,
uploads, finances and person privacy. Overall unit coverage is **11.47% lines,
11.44% branches**, not a percentage of features implemented. Global 70%
line/branch/function/statement gates still fail and CI must not call them green.
HTML/full JSON reports are generated in ignored `coverage/`; rerun
`npm run test:coverage` to reproduce the currently nonzero gate exit.
