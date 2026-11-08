# Private-link navigation and draft protection

Local implementation and verification, 2026-10-22. This is not full PRD or
supported-browser acceptance.

## Behavior

- Forms access/resume/edit/upload links, account setup, team invitations,
  newsletter confirmation/unsubscribe and event reminder capabilities establish
  an in-memory route context. An explicit replacement capability on the same
  path starts a fresh context; Forms preview/public transitions do likewise.
- Capabilities never become DOM identifiers or React keys. Random context keys
  are unrelated to their values. No storage or logging was added.
- Capability cleanup preserves React Router's exact history state rather than
  replacing it with `null`. It removes only recognized private parameters,
  preserving unrelated query parameters and ordinary anchors.
- Setup/invitation/newsletter capture is render-pure and component-local. URL
  cleanup happens after commit, not during a repeatable render. Existing legacy
  newsletter query tokens are supported and stripped too.
- The draft registry treats an incoming recognized capability as a meaningful
  context change, while ordinary anchors do not discard or block draft edits.
  Existing navigation confirmation still blocks while an operation is busy.

## Evidence

- `tests/capability-navigation.test.ts`: five regression tests, including exact
  history metadata preservation, malformed explicit capabilities, ordinary
  anchors, route scopes and render-pure capture.
- `npm run test:local-form-navigation -- --hold-for-browser`: 15 actual local
  HTTP/storage/scanner/Form checks, including independently saved fictional Alpha
  and Beta drafts. Evidence: `../phase0/local-form-navigation.json`.
- Actual Chrome: opening Alpha then Beta on the same form restores only the
  corresponding identity/answers. Editing Beta and using Skip to content retains
  edits. Home displays the unsaved-work dialog; Stay retains edits, confirmed
  departure works, and Back returns a blank public form without resurrecting
  either private draft. Forward works. Screenshot:
  `../phase0/form-navigation-leave-warning.png`.
- The browser fixture's private URLs are stored only in a generated, Git-ignored
  mode-0600 `.local` file, removed by the harness on cleanup. No private URL or
  token appears in the evidence report. Test forms/accounts are recoverably
  archived and public media approval is revoked after testing.
- Existing actual team-invitation HTTP/SQL regression suite passes after the
  capture change. No external invitations or provider sends were enabled.

## Remaining acceptance

Native address-bar/hash changes are not equivalent to a React Router Link;
cross-browser behavior for dirty forms under every native navigation mechanism
is not certified by these checks. Browser Back/Forward was tested through normal
application navigation. Complete device, screen-reader, busy-operation,
outage/reconnect and private-route navigation acceptance remain open.
