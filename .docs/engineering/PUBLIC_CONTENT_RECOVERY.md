# Public content failure and recovery

Reviewed locally on 2026-10-26. Homepage events now request the next three upcoming
events directly, independently from the CMS shell. A failed request presents a
retry instead of claiming that the calendar is empty. A successful empty result
retains the approved first-use message. Existing results remain during retries.

Shared chapter content retains its last successful snapshot and timestamp after
refresh failure. On first failure the static identity, navigation and CTAs remain
usable with an explicit retry. Older requests cannot overwrite newer snapshots;
unmount aborts initial requests. Malformed CMS responses are recoverable failures.
Retry controls move focus to the persistent main landmark before they unmount.

The private saved-draft composition overrides only the curated CMS fields; public
metrics and inventories retain their ordinary read paths. CMS editor saves remain
confirmed when the subsequent public refresh fails, with a separate refresh
notice. No failed refresh is presented as a failed database save.

Typed CMS projections replace the former unrestricted context types and unused
collection loaders. The source import audit caches repeated resolution work but
still checks both HTML roots and every active module. No test timeout, coverage
threshold or exclusion was relaxed.

Evidence: 22 new DOM/payload tests, 633 passing tests across 109 files, strict
TypeScript and zero lint errors/25 warnings. Overall unit coverage is 28.13%
lines/26.71% branches and still fails the unchanged 70% gate; all 17 critical-file
branch gates pass. The real homepage was inspected in Chrome; its full-page
capture from October 24 is `../ui-review/homepage-recovery-check.png`; the restarted
October 26 viewport is `../ui-review/homepage-recovery-viewport.png`. Fault injection was in DOM
tests, not a hosted provider outage or full screen-reader/device acceptance.

The earlier retirement scan recorded 36 warnings before shared utility files
were restored. The current complete scan includes those retained files and the
unchanged untracked user file; 25 is the current CI ceiling.

The real 21-check CMS suite passes twice consecutively after correcting its
finite fixture-slot handling. It creates only in an unused managed slot, then
records its own archived fixture in ignored mode-0600
`.docs/local-cms-fixture.local`. Later runs require an exact owner, title,
revision and archived-state match before restoring through the scoped API. A
changed or active record is refused. Fixtures are archived again; existing copy
and earlier unregistered fixtures remain untouched. No rows are hard-deleted.
