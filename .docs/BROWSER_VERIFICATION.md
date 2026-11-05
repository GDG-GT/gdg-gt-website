# Public browser verification — November 4, 2026

Pinned Playwright 1.64.1 now runs production-build public smoke checks across
Chromium at 1920×1080, 1440×900 and 375×812; Firefox at 1440×900; and WebKit at
1440×900 and an emulated 375×812 mobile viewport. Every intercepted API response
is explicit: public inventories are empty, the chapter is live and the session
is anonymous. Unknown API/external requests fail the fixture; all non-read API
requests are blocked and cause failure. No database, credentials or provider
sends are used by this suite. Traces/videos are disabled.

For the homepage, Events, Team, Resources, Sponsors, Gallery and Contact, checks
cover headings, visible footer, horizontal overflow, scrolling, JavaScript errors
and contrast-enabled axe WCAG A/AA rules. Each captures viewport and full-page
review images when applicable. Additional checks exercise compact mobile-menu
placement/keyboard escape/focus/route closing, failed event-read retry, public
404 recovery, anonymous admin refusal and the reduced-motion hero fallback.

A separate capable-desktop Chromium check observes three distinct rendered WebGL
frames after pointer intent, then restores the reduced-motion poster. Chromium
uses software WebGL for reproducibility; these are functional checks, not agreed
hardware FPS or Web Vitals measurements. A fixed screenshot region avoids
waiting for an animated locator to settle. This particular software capture has
a 60-second harness budget; the product's performance targets are unchanged.

Run after `npm run build`:

```
npx playwright install chromium firefox webkit
npm run test:browser
npm run test:browser:report
```

The default starts an isolated production preview on loopback port 4173.
`GDG_BROWSER_ORIGIN` can select another loopback HTTP origin; remote origins are
rejected. The API fixture remains enabled regardless of origin. Results and
unapproved review captures are in ignored `artifacts/browser/`; the sanitized
invocation summary is `phase0/browser-smoke.json`. Filtered invocations record
only the tests actually selected; no report approves acceptance automatically.

The new PR CI job uses the matching official Playwright container pinned by
digest, Node 24, all six projects and retained reports/review candidates. Local
macOS execution is not evidence that GitHub ran the new job. No push or remote
workflow run was performed.

Actual loopback checks are separate from the API-fixture suite:

- `node scripts/test-local-public-browser.mjs` passes 21 checks: the seven public
  pages at both required desktop viewports and 375×812. Existing published
  inventories are read through the real local API, with fresh anonymous browser
  contexts, contrast enabled, no JavaScript errors/overflow and working scroll.
  External origins and non-read API requests are blocked. Evidence:
  `phase0/local-public-browser.json`; captures:
  `artifacts/browser/live-public/`.
- `node scripts/test-local-hero-browser.mjs` passes six actual local checks:
  poster before intent, WebGL after pointer intent, three distinct frame
  captures, reduced-motion restoration, mobile fallback, and no page errors,
  mutations or external requests. Evidence: `phase0/local-hero-browser.json`.

All 1,222 existing Vitest tests/146 files pass again. The last instrumented run
remains 59.29% lines/58.30% branches/57.80% statements/50.13% functions, below the
70% requirement; all 17 critical-file branch gates pass. Browser checks do not
inflate or replace that coverage gate. Types now include the browser harness.

The final six-project invocation passes all 70 applicable browser checks, with
eight expected profile skips: mobile-menu checks on four desktop profiles and
software-WebGL checks on four non-desktop-Chromium profiles. Types/lint (zero
errors/25 inherited warnings), build, byte budgets, traceability and the secret
scan pass. The current audit has no high/critical findings: production has two
moderate/four low; the full tree has fifteen moderate/seven low. No audit fixes
or production dependency changes were made by this checkpoint.

All 22 populated prompt surfaces, initial human visual approval, approved masks
and actual 1% pixel comparison remain open. These captures are review
candidates, not golden baselines. Real Safari/devices, assistive-technology runs,
200% zoom, populated/error/dialog/private Forms/admin workflows, PWA/push,
Lighthouse and hosted acceptance also remain open. The API-fixture suite does
not exercise backend authorization beyond client handling of an anonymous
session. Chapter assets/content still require their separately recorded approval.
