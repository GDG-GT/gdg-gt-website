# Unsaved-work navigation

`NavigationSafety` is the shared data-router boundary. `useDraftGuard` registers
only dirty/busy booleans, a generic editor label and whether work is bound to an
admin session. It must be called before any conditional return. It never saves
draft contents or credentials. Guard disposal follows component unmount.

- Ordinary route links and browser Back/Forward (including changed search
  parameters) are blocked before the route changes. Stay is the safe default.
- Refresh/close use a native `beforeunload` warning; browsers determine its text.
- Busy operations cannot be discarded through the in-app dialog. Callers must
  report in-flight state accurately and keep retry/idempotency behavior intact.
- Local component changes that unmount editors must wrap the **entire state
  transition** in `useNavigationSafety().request(callback)`, not clear inputs and
  then ask to navigate. This also covers nested team editors and explicit logout.
- `useApprovedSearchParams` is only for an existing editor's own query update
  after its local discard check or successful commit. It bypasses the shared
  blocker synchronously for that one transition; it is not a general-purpose
  substitute for `useSearchParams`. Browser history and ordinary links still
  pass through the blocker. New UI should prefer a shared request around the
  entire transition and avoid duplicate local confirmation dialogs.
- A successful save followed immediately by navigation may use `allow(callback)`
  only after the commit response. It does not globally unregister the editor.
- Forced session-clear suppresses private session-bound guards, not unrelated
  public Form/contact/registration work. Internal Forms are session-bound.

Implemented editor integration and browser checks are listed in
`IMPLEMENTATION_STATUS.md`. Remaining legacy editors must opt in as they are
replaced; there is no claim that detecting arbitrary DOM edits is safe or complete.
The registry is not security enforcement. Server session, permission, revision
and idempotency checks remain authoritative.
