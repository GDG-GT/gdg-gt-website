# Form image blocks and header media — local implementation

FORM-003/007 now use actual selected published chapter images, not an illustrative
hardcoded photograph. The builder offers a paginated approved-image selector,
alternative text, removal, empty/loading/error/retry states and header preview.
Image blocks preserve intrinsic dimensions; headers use a fixed crop. Public
rendering uses responsive same-origin derivatives, alt text, decoding/loading
policy and a truthful unavailable state if publication is withdrawn.

Only already-public, scanned and explicitly approved media is selectable.
Restricted form access does **not** make those images private. There is no new
automatic media publication and no external URL/tracking-pixel input. Uploading
and publication remain the separately authorized media workflow. Up to twenty
image blocks plus one header are supported. Publication requires alt text.

Migration 098 puts the previous form mutation function in the private schema,
revokes direct service/browser execution and exposes one fixed-search-path
service-only entry. It checks current form authorization before looking up
images, takes the account/media locks in consistent order, and validates each
selected image inside the mutation transaction. Draft images may be unfinished;
they cannot publish until selected and labelled. Invalid/unavailable media cannot
be smuggled into a saved draft or published version through a direct RPC.

Media usage now includes exact image/header references in current drafts and all
retained immutable form versions, using indexed JSON containment. Historical
references block destructive media archive/cleanup even after draft replacement.
Privacy publication revocation still works immediately; a form cannot force an
image to stay public. The public renderer then shows its unavailable state.
Permanent reviewed form erasure releases references through the existing policy.

## Local evidence

- 98 migrations/canonical SQL and both 100-client races pass under both new and
  legacy Supabase grant defaults. New SQL covers authorization, direct-call
  bypass prevention, public-image existence, alt text, history usage and revoke.
- 387 unit tests pass, including actual rendered same-origin image markup,
  responsive sources, dimensions/alt/loading and invalid/tracking URL rejection.
- `npm run test:local-form-images` passes 13 real HTTP/storage/ClamAV/sharp/Forms
  checks. Its generated coral rectangle is a test fixture, not chapter imagery.
  The approval was revoked, the form/account recoverably archived, and private
  media retained because its historical form version still references it.
- Existing Forms/upload suite passes after the migration. Desktop/375px browser
  checks actual image loading, no horizontal overflow, selected picker/alt text,
  and header settings. Screenshots: `../phase0/screenshots/form-images-*`.

`--hold-for-browser` keeps only this run's fictional fixture available until
`done` is entered, then runs revoke/history/cleanup assertions. It never sends
mail, publishes a real asset, or exposes a private storage key in its evidence.

Full supported-device/manual accessibility and hosted media/security/visual
acceptance remain open. Theme, progress and safe-shuffling settings have a separate
implemented checkpoint in `FORM_PRESENTATION_OPERATIONS.md`; neither checkpoint
certifies broad hosted or full PRD acceptance.
