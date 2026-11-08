# Interaction and route-frame verification — 2026-10-24

Added 25 DOM interaction tests using React Testing Library and JSDOM 29.1.1,
which supports the local Node 25 and CI Node 24 engines. Both are development-only
dependencies. The application dependency tree is unchanged by these tools.

The tests exercise actual React controls with an injected transport:

- Dashboard named loading state, permitted quick actions, independent widget
  failure, retry and retention of a dated snapshot after background failure.
- Audit detail opening/focus/closing/return focus, fixed-snapshot cursor history,
  filtering/export-link continuity, date errors and recoverable detail failures.
- Mandatory respondent name/email, associated errors and first-invalid focus;
  review/back; pending edit freeze and duplicate prevention; stable idempotency
  after an uncertain failure; preview and offline submission refusal; exact own
  copy opt-in and response-confirmed success.
- Fragment-only save/resume/edit links, restored identity/answers, clipboard
  delivery of the private resume link, distinct revision-aware editing and
  generic private-access verification feedback.
- Editable file count, exact fractional-MiB byte conversion, retained last file
  format, documented cleared-limit defaults and safe-pattern error association.

Transport injection is not a real server transaction, provider email, private
storage, malware scan or Realtime test. Those remain covered separately by local
HTTP/SQL/ClamAV/WebSocket suites. JSDOM does not prove layout, contrast, a real
screen reader or supported-device behavior.

The separate CUA browser smoke check inspected 37 initial rendered primary route
frames at desktop and 375px width. No page-wide horizontal overflow or locked
body scrolling was observed. Initial public/admin controls had accessible names;
public frames had one canonical and no missing-alt or broken loaded images.
See `../phase0/local-route-ui-smoke.json`. Empty/retained local inventory and initial
frames do not cover every loaded state, drawer, editor or role workflow.

609 tests across 106 files pass. Strict types, lint at 0 errors/245 warnings and
the structural traceability check pass. Overall V8 lines are 16.30% and branches
16.61%; the 70% global gate still fails, with no exclusions or threshold changes.
All 17 individual critical-file branch gates pass. Production audit remains zero
high/critical, two moderate and four low. No full WCAG/axe/visual/launch approval
is claimed.

References: [React Testing Library setup](https://testing-library.com/docs/react-testing-library/setup/)
and [JSDOM project documentation](https://github.com/jsdom/jsdom).
