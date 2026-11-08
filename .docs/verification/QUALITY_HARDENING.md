# Quality hardening checkpoint — 2026-10-22

This is local implementation/verification evidence, not full PRD acceptance.

## Strict types and dependencies

Application and build TypeScript run with `strict: true`. Shared JavaScript schema
modules are included for inference (`allowJs`); no source file was excluded and
no blanket declaration, `any` suppression or `ts-ignore` was added to pass.
Legacy and active nullable data, editor state and asynchronous retry-key handling
were corrected. Catch values are checked before reading their message.

Compatible lockfile updates and scoped overrides remove known production
high/critical findings. Actual production audit: **6 findings, 0 high/critical,
2 moderate and 4 low**. Full audit still includes five high development findings
in the Tailwind 3/braces build chain; this is not an all-dependencies-clean claim.
No forced downgrade or blanket vulnerability waiver was used.

Overrides are limited to Excalidraw's pinned NanoID/Sass, its Mermaid adapter's
NanoID and lodash-es. Reviewed call sites use the supported NanoID named export;
Sass is build-only. New dependencies were installed in a separate cache, rebuilt,
then activated through the existing dependency symlink. The prior cache remains
recoverable. Build, type/unit tests, 37 real whiteboard HTTP/socket checks and
actual browser text creation/versioned saving pass. Recheck the pins with upstream
releases by 2026-11-22; pins are not a security exception for future findings.
Primary references: [DOMPurify releases](https://github.com/cure53/DOMPurify/releases),
[Excalidraw releases](https://github.com/excalidraw/excalidraw/releases).

## Build, PWA and motion

`npm run build` emits a manifest. `npm run test:bundles` follows static dependency
edges, measures real gzip bytes, checks images/fonts and forbidden public files,
and compares emitted text with known private local configuration without printing
the values. It does not replace a complete Git/history secret scan.

- Public initial JS: 181,033 bytes gzip; CSS: 42,012; fonts: 48,432.
- Offline entry: 76,724 bytes gzip JS and 40,193 CSS.
- Offline precache: 11 entries, 547,266 raw bytes; no editor or 3D install.
- Above-fold hero/mark images each stay under 250,000 bytes.

Removed vendor buckets that pulled 3D into initial and offline imports. The
decorative scene is now progressive enhancement after genuine interaction while
the hero is visible. Reduced motion, narrow screens, data saver, slow connection,
low memory/CPU use the existing static art before any 3D import. Canvas rendering
still pauses outside the viewport/in a hidden tab. Desktop/375px production
startup/update/layout were checked in Chrome. Other browsers/devices, actual
offline upgrade/cache inspection, mobile p75 Web Vitals and Lighthouse remain open.

## Tests and honest coverage

384 unit tests pass. The real Forms/upload suite passes 124 HTTP, private storage,
ClamAV and cleanup checks; newsletter passes 31 local checks. Retention/monitoring
each pass 13 real checks. `test:e2e` currently runs the real native Forms/upload
suite only; it is **not** an all-feature automated browser suite. It requires the
dedicated local stack and does not reset security quotas or contact real providers.

`npm run test:coverage` uses [Vitest V8 coverage](https://vitest.dev/guide/coverage.html)
over all source, including preserved historical screens, and explicitly includes
unimported files. SQL and separate live HTTP/browser checks are not included in
that unit measurement. Latest overall lines: **10.5%**, branches **10.34%**.
These are coverage numbers, not a percentage of PRD features implemented.

Auth branch coverage is 98.52%; security/authorization/HTTP primitives are 100%.
Other critical files remain below 90%. Global 70% and individual critical-file
90% gates intentionally fail until missing tests are implemented. CI runs the
coverage gate independently of lint/type/unit/SQL/build and dependency gates.
No exclusions or successful-exit override hide the coverage failure.

Full lint: zero errors, 245 warnings (including an unchanged user-owned untracked
file). Conditional-hook violations were removed by gating the preserved admin
components outside their hook-owning content. Cache invalidation now calls the
real all-content function rather than a shadowing route callback. A regression
test covers this. Interrupted streamed responses now count as operational
failures without retaining exception text. Other inherited hook/correctness
warnings still require review; broad lint and quality acceptance remain open.

## Additional Forms gap found during the audit

The image block still uses an illustrative hardcoded image, and `headerMedia`
is accepted in the definition but not exposed/rendered. These are **not complete**
FORM-003/007 implementations. Replace them with actual selected approved images,
alt text, publication/usage safeguards and tests. Also verify the remaining theme,
shuffling and preview settings rather than assuming schema fields are working UI.

Release still needs the remaining local tests/features plus user-approved hosted
infrastructure, institution policy/content/assets, provider configuration,
supported-device/manual accessibility/visual sign-off and release observation.
