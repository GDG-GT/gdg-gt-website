# Private community members

PRD §24.1: community CRUD, academic fields, categories, interests, active state,
duplicate-email prevention, profile synchronization and explicit merge review.
Community people are not officer accounts. Core/category flags grant no access.

## Scope and privacy

The workspace uses protected `/api/v1/admin/members` APIs. Current Admin/Super
Admin accounts manage active scopes; ordinary accounts require current active
team membership, the Members page grant and the corresponding CRUD action.
Blog Editors are denied. Inactive-team history is read-only to global admins.
Lists, filters, totals, details and activity follow current scope. Summary lists
omit phone, academic year/major and interests; authorized detail reads fetch them
separately. Project relationship counts additionally require project-read access.
No browser table/Realtime grants or private browser-storage cache are added.

All writes require CSRF, idempotency, current authority and aggregate revision.
Email normalization/uniqueness includes retained records; records cannot be
hard-deleted. Archive, restore, public-profile synchronization and unmerge require
the current password and exact full `MEM-…` reference. Restoration stays inactive.
Read audits hash filters rather than retaining raw private search/contact values.

## Separate public profile workflow

Synchronization additionally requires current public-profile access/action grants
and the current profile revision. It creates or updates an **unpublished draft**,
not an account or publication. Private phone, academic fields and interests are
not copied. Identity changes, community deactivation or team archival unpublish
linked profiles atomically; phone-only changes do not demote unchanged identity.
Reactivation, restoration and team recovery never automatically republish people.
The publication path independently rejects inactive/archived/merged people.

## Conservative merge policy

Only administrators can merge two same-scope identities. Preview compares their
private fields and issues a five-minute, session-bound proof held only in memory;
only its hash is persisted. Both revisions, both exact references, current
password/authority and an unused proof are rechecked at commit. Active project
roles/current public profiles must first be explicitly reviewed and removed or
archived. Cross-scope identity merging is rejected.

Merge creates a retained inactive source alias to the canonical target; it does
not silently overwrite canonical fields, move account access, combine financial
or Forms history, or rewrite project history. Explicit unmerge recovers a
separate inactive record. This conservative interpretation preserves reversibility
and requires operator review instead of destructive inferred data consolidation.
Expired-session deletion removes only ephemeral review metadata, not member or
append-only audit history. Concurrent database serialization/deadlock conflicts
return an explicit reload/retry response rather than accepting stale changes.

## Verification and boundaries

60 canonical migrations and complete SQL/capacity regressions pass. Current
unit suite: 238 tests. `npm run test:local-members` records 45 actual isolated
loopback checks in `../phase0/local-members-integration.json`; separate list-data
minimization evidence is in `../phase0/local-members-list-minimization.json`.
`-- --hold-for-browser` allows an independent `change`, then `done` cleanup.
Fictional fixtures are recoverably archived; no real person/provider/mail used.
An interrupted browser fixture cleanup after a Vite restart was completed against
its exact validated IDs, retaining history; the full HTTP suite was rerun cleanly.

Browser proof (`../ui-review/real-members-*.png`) covers actual edit/save,
independent revision conflict with preserved input/disabled stale save, actual
merge and unmerge, mobile 375 px/339 px editor, native scrolling, and Stay/discard.
Merely opening an unchanged editor does not prompt. Full accessibility,
multibrowser/load and production operations acceptance remain open.

Local development hardening also blocks `.docs`, server/database/infrastructure,
environment/key/local files from Vite file serving. The local credentials URL
previously returned HTTP 200 on the loopback server; it now returns 403, including
the direct filesystem route. No response body was printed or retained by the
probe, and there is no evidence of outside access. `test:local-dev-security`
records 11 file-policy and app-health checks. This is not a production security
certification. Session-switch transport hardening is separately recorded in
`../engineering/SESSION_TRANSPORT_SAFETY.md`; final system-wide security acceptance remains open.
