# Protected Forms read and filter recovery (local)

Definition reads are abortable and bound to the requested form, account and role.
Replacing a read or leaving the hook aborts the old request; late results are
ignored. A library filter/account/role change hides the previous snapshot during
render, before the new effect starts. Disabled invalid-date library queries do
not expose an old snapshot or send a request. The existing application shell also
remounts route content on pathname changes; this is additional hook-level scope
protection, not evidence that the old route shell rendered another form.

Builder and response definition loading now use named skeleton/status states.
Initial failures have an explicit load retry and Forms return path. Retry focuses
the persistent workspace landmark. Response table, summary and saved-view reads
ignore aborted results, so a late table cannot appear under Summary or vice versa.

Response filters now reflect the applied URL/saved view, including local-time
date controls. Reset clears unsubmitted edits even when the query was already
empty. Seconds and milliseconds are preserved, and an unchanged saved instant
is retained through daylight-saving repeated hours. Reversed ranges are rejected
before another result read, with inline error association and end-date focus.
Summary/Responses use roving tab focus, Arrow keys/Home/End and a labelled panel.
Applying, resetting and choosing a saved view move focus to persistent content;
pagination does the same.

Twenty-two added hook/DOM cases cover these behaviors with controlled late and
failed reads, explicit retry, transport abort signals, filter values, date
round-trips, reset and keyboard operation. All 807 tests/121 files pass; strict
types pass and lint stays at 0 errors/25 warnings. Global coverage is still below
70%: 34.79% lines/33.03% branches. All 17 critical-file branch gates pass.

Actual local runtime HTTP checks pass nine cases using newly created fictional
form `fictional-runtime-f9196257-113745`. Chrome loads its authorized builder and
response table, displays URL date instants as 08:00 local time for 12:00 UTC,
switches tabs with Arrow/End, focuses an associated inline reversed-range error
and clears query/date controls with Reset. A 375 px layout check finds all five
filter controls within the viewport and at least 44 px high; the wide table is
confined to its own horizontal scroller. The viewport was reset.

The initial unavailable/retry and delayed-read races are DOM tests, not browser
network-fault injection. The live unknown-ID attempt remains concealed by the
existing access guard before the builder renders; it does not prove the new
builder retry UI. Only the test fixture was recoverably archived, its actor was
disabled/sessions revoked by the runtime script, and synthetic responses remain
under its existing policy. No real recipient, provider send or deployment.

Evidence: `../phase0/local-form-runtime.json`,
`../phase0/protected-form-browser-observations.json`,
`../ui-review/form-response-filter-recovery.png`. Supported-device screen-reader,
real outage/role-change/reconnect, broader builder/runtime and hosted acceptance
remain open; this does not complete the PRD.
