# Local UI review checkpoint

This is a local-only UI implementation, not completion of PRD v1.5 or a launch
approval. No deployment or remote repository has been created.

## Implemented in this UI pass

- Rebuilt public shell, home, events/detail, team, resources, sponsors, gallery,
  contact, token-result pages, and fallback pages. Public Blog/Projects routes
  remain unavailable; retained admin tools remain in the workspace.
- Real React Three Fiber objects: frosted donut, dimensional star, jelly form,
  faceted gem, confetti, pointer response, and scroll-driven movement. The campus
  atmosphere is a separate raster layer, not a substitute for the moving scene.
- Reduced-motion/mobile/data-saving fallbacks; rendering pauses when the hero is
  outside the viewport or the tab is hidden.
- Charcoal sidebar, shared navigation/search/account header, dashboard,
  permission-filtered destinations, responsive drawer, and existing admin
  workflows carried into the new visual shell.
- Native local form library, 23 field types, sections and duplication, field
  duplication/order, keyboard movement, undo/redo, autosave, field visibility
  rules, basic validation, access-setting UI, versioned publishing, respondent
  preview/review/save/resume/edit, response workspace, exports, and redaction.
- Low-tint neutral off-white surfaces following Tejas's latest 2026-10-19
  correction: the pale-yellow treatment was rejected across the site, particularly
  in admin. The homepage glass is peach again; the atmosphere remains peach and
  coral, and the sidebar/footer remain charcoal.
- Addressed inherited route crashes, missing cache imports, service-worker-ready
  hangs, body scroll-lock interference with dialogs, and TypeScript mismatches
  encountered while preserving the existing UI.

## Verified locally

- Original application was run before UI replacement; baseline is `d71dbfe`.
- All 26 sidebar destinations were opened during desktop route inspection.
- Public pages and principal workspace screens were checked at phone/tablet
  widths; Forms, Communications, and Media overflow defects were corrected.
- Form builder: added a question, published version 2, opened respondent preview,
  submitted fictional answers, and verified version-2 answers in Responses.
- Saved a response view. Generated/downloaded an actual XLSX through Vivaldi's
  save UI; ZIP integrity and worksheet XML validation passed. Sample export files
  are isolated in the ignored `.ui-review.local` directory.
- Computed-style scan of 14 representative routes found no pure-white visible
  surface backgrounds and no document-width overflow at desktop width. Native
  checkboxes/radios use the shared surface palette.
- New UI lint, full TypeScript project checks, UI unit tests, and production
  compilation are available as the commands in `LOCAL_DEVELOPMENT.md`.
- The 10 inherited whole-repository lint errors were subsequently resolved in
  Phase 0 without disabling rules. Hundreds of inherited warnings still remain.
- Follow-up scroll fix removed universal scroll-chain suppression and replaced
  overlapping legacy dialog locks with shared ownership and cleanup tests. Real
  wheel input moved the admin profile from 0 to about 848 CSS pixels.
- The neutral-palette follow-up reviewed main public pages and all sidebar
  destinations at desktop width. The new phone-width pass remains pending after
  browser-control timeouts; the earlier mobile review is not a substitute for it.

## Explicitly not complete

- Production schema, authentication/gate/session/CSRF migration, action-level
  authorization, realtime authorization, jobs, delivery providers, financial
  correctness, and all security/retention guarantees remain backend work.
- The form UI is not the whole FORM-001–030 implementation. Section branching
  and ending rules, shuffle controls, header-media/theme controls, advanced
  validation, collaborator/invitation management, secure token flows, retention
  holds, private upload/scanning, large export jobs, and notification delivery
  require further implementation. Current local visibility rules are not a
  complete branch engine. Local revision history is not an audited server log.
- Existing admin workflows are preserved/restyled, not all rewritten to the new
  PRD's API/state-machine contracts. Legacy dialogs still need a comprehensive
  keyboard/screen-reader audit and consistent labeled controls. Backend-dependent
  failure/conflict/permission states are not comprehensively exercised.
- No claim of WCAG certification, Core Web Vitals acceptance, full-browser test
  coverage, pinned-clock visual regression, offline queue, push, or completed SEO.
- Photos/architecture are development assets pending chapter review. Empty team
  and sponsor datasets are not filled with invented people or partnerships.
- The `yellow-*` captures in `../ui-review/` show the superseded, rejected yellow
  palette. Other captures are review artifacts, **not approved golden baselines**.
  PRD visual sign-off must come from Tejas; the implementation cannot approve it.

## Git and local use

Branch: `feat/ui-local`. No AI attribution/coauthor trailers are used in commits.
Run `npm run dev` and open `http://127.0.0.1:8080`.
