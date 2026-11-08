# External actions and Linktree preview focus

Local review, 2026-10-26. Managed external action buttons now include an external
arrow, a new-tab announcement and `noopener noreferrer`. Absolute chapter links
on the current origin stay in the router, retaining their search and fragment.
Unsafe protocols, credentials, protocol-relative destinations, backslashes and
control characters do not become actionable managed links. Existing server URL
validation remains authoritative.

Public officer/social links and private Markdown now provide external cues;
Linktree distinguishes opening a new tab from opening an inline preview. The
existing safe Markdown and Linktree URL/iframe allowlists remain in force.

Linktree opening focuses the inline consent heading and closing returns to the
trigger. Clicking an expanded trigger closes it. A loaded Google Forms preview
still requires the navigation safeguard before it can close, switch or leave.
Stay preserves it. Discard allows the chosen destination to own the next focus,
instead of the confirmation dialog restoring an obsolete control afterward.
Changing profiles clears the previous frame and its consent state. Failed
profile avatars now use the local chapter mark safely.

Verification: 22 new DOM cases use the actual router/navigation guard, plus
same-origin and hostile-link inputs. All 666 tests/112 files pass; strict types,
zero lint errors/25 warnings, build and public byte limits pass. Global unit
coverage is 29.33% lines/27.62% branches, below the unchanged 70% gate; all 17
critical-file branch gates pass. This is not full PRD or accessibility approval.

Thirty-six actual local Linktree HTTP/database checks pass with isolated
fictional accounts, team and profile. Those fixtures are recoverably archived
and sessions revoked after review. CUA verified native keyboard activation,
heading focus and trigger restoration. No provider frame or external page was
loaded in the real browser; actual embedded-frame guard cases were exercised in
DOM tests with injected local data. The screenshot
`../ui-review/linktree-consent-focus.png` shows the fictional consent screen.
