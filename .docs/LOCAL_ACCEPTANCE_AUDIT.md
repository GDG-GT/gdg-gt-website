# Local implementation and acceptance audit — 2026-11-06

Source inspection after respondent recovery checkpoint 131. These are concrete
remaining local findings, not an exhaustive acceptance certificate. All 146
numbered requirements and 159 logical acceptance cases remain unverified against
the complete PRD definition; hosted/device/manual/approved-visual gates cannot
be inferred from local tests.

## Confirmed local work

1. Community directory: `src/ui/members/MembersWorkspace.tsx` combines independent
   capability, inventory and selected-record errors into one message. A successful
   inventory refresh can hide a failed capability read; selected activity failure
   silently removes the activity view. Refresh failure discards successful private
   snapshots, and query/selection changes can temporarily display another context's
   state. Add independent keyed/timestamped read recovery, explicit current access
   recheck, offline/action fencing and account/session cancellation. Preserve CSV
   import/export and reviewed merge/profile behavior. Verify both allowed and
   denied paths before evaluating the native mutation recovery separately.
2. Contact inbox: `src/ui/communications/ContactInbox.tsx` disables its sole refresh
   button whenever a selected inquiry is present. A failed selected-detail read has
   no available retry. Refresh also unmounts detail editors and drops snapshots;
   selected empty/malformed results can reach `list.items[0].id`. Add independent
   private reads, recoverable selected inspection, context cancellation and a safe
   unavailable-result view. Inspect attachment capability and status/hold recovery
   against current authority; do not introduce provider sends.
3. Person-data privacy: `src/ui/PrivacyWorkspace.tsx` retains recent-request metadata
   on failed reads without a timestamp, and does not clear prior metadata/review on
   current 401/403/404 denial. Its review/commit transport has timeout and session
   guards, but unknown outcomes do not receive the explicit original-outcome
   inspection used elsewhere. Use the existing authorized request-status path
   where possible, preserve proof/hold/expiry constraints, and never describe a
   logical deletion or pending cleanup as physical erasure.
4. Global coverage: at checkpoint 130, functions (62.40%) and statements (69.44%)
   failed the unchanged 70% gate. Do not exclude active modules, lower gates or
   replace behavior verification with mirrored implementation assertions. Add
   meaningful recovery/role/keyboard workflow tests while addressing these gaps.

## Acceptance work still separate

- All mandatory ID ranges and normative Sections 21–33, negative role/team and
  supported-browser populated/mutation/dialog states.
- The 22 populated visual compositions at 1920×1080, 1440×900 and mobile;
  approved assets/content and Tejas's blocking visual approval, then 1% diffs.
- Manual keyboard, assistive technology, 200% zoom, actual Safari/devices,
  Lighthouse accessibility 100/performance targets, runtime Web Vitals and
  representative 3D hardware/load testing.
- Physical PWA installation/update/cache/queue multi-tab and logout scenarios;
  actual supported-device opt-in push permission/delivery/click acceptance.
- GT-owned hosting/domains/secrets/mail DNS/VAPID/storage CORS/scanner/scheduler,
  hosted headers/CSP/CI/staging, supervised monitoring/alerts, PITR/object restore,
  RPO/RTO and 48-hour rollback/observation; institutional retention/finance/privacy
  and brand approval.

SSO/Google and Bevy/Engage remain explicitly deferred. Local-only authorization
does not authorize deployment, production changes, purchases, real provider sends,
another auto-resume timer or AI commit trailers. Existing user edits remain intact.
