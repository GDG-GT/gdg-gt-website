# Native Forms presentation settings

Local FORM-007 implementation. Settings are persisted in the versioned definition;
editing a draft does not modify an already-published form.

- Theme: approved coral default or charcoal accent. No arbitrary CSS, colors or
  remote resources. Both keep existing neutral surfaces and readable controls.
- Progress: the visual progress bar can be disabled. Section text remains for
  orientation. Existing definitions without the property keep the current default.
- Question shuffling: stable within an attempt, confined to the same section and
  contiguous answer groups. Title/description/image/divider blocks remain anchors.
  Conditional questions or section branches disable this mode; publication also
  rejects the invalid combination. Historical malformed combinations fail safe.
- Choice shuffling: only unordered radio/checkbox/dropdown choices. Stable option
  IDs stay paired with their values. Other/decline escape options stay at the end;
  relative-position wording is not shuffled. Ratings/scales/grids/rankings retain
  their semantic order. Canonical definitions, answer validation and exports are
  unchanged; presentation never becomes authorization or validation input.

The respondent's existing attempt capability seeds a deterministic non-security
permutation in memory. It is not a token generator and is never logged. Review
uses the same presented field order as the questions. Save/resume/edit remain
bound to the existing private capabilities and immutable version, not display
position. Reopened attempts may use a different order; saved answers use IDs.

Builder Settings now opens the settings tab, and Edit opens the field tab. Tabs
have a single tab stop, arrow/Home/End behavior, associated panels and unique
inline/dialog IDs. Native theme controls and switches support keyboard changes.
Settings that were absent historically remain optional in the schema: merely
publishing an older draft does not inject new defaults and invalidate its hash.

## Local evidence

- 392 unit tests, strict application/build types and lint (zero errors/245
  inherited warnings) pass. Tests cover deterministic variation, immutability,
  section/content anchors, conditional safety, option ID pairing and schema input.
- `npm run test:local-form-presentation` passes 16 real storage/scanner/media/
  Forms HTTP checks, including setting round-trips and actual answer submission
  with original IDs/values. The fixture publication was revoked and the fictional
  form/account recoverably archived. No external provider was contacted.
- Chrome verifies shuffled choices/questions, actual charcoal styling, no public
  progress bar, keyboard tab/switch changes, autosave and persistence after reload.
  A coral/progress-enabled draft preview is distinct from its still-charcoal,
  progress-disabled immutable publication. At 375px it has no horizontal overflow.
- Existing native Forms/upload end-to-end suite and public byte/artifact budgets
  pass. Evidence: `../phase0/local-form-presentation.json` and screenshots named
  `../phase0/screenshots/form-presentation-*`.

Broader screen-reader/supported-device, field/error-state coverage, hosted and
full PRD quality/launch gates remain open. This checkpoint does not close them.
