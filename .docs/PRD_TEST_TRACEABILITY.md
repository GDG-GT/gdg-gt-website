# Numbered PRD test mapping

All 146 explicit v1.5 requirements now map into 152 logical acceptance cases in
`phase0/prd-test-plan.json`. Each case identifies its concrete executable source
suites, applicable manual/hosted work and an unverified acceptance state. Cases
may cover several related requirements; this is not a count of tests executed or
features completed. Normative Sections 21–33 and phase exit gates also apply.

The mapping is reviewed in `scripts/lib/prd-test-plan.mjs`. Run
`npm run test:traceability` to validate IDs/ranges, file existence, complete
requirement coverage and consistency with the stored PRD hash/inventory. CI now
runs this structural check. After an intentional mapping review, regenerate the
two JSON artifacts with `node scripts/check-prd-traceability.mjs --write`.

The checker never changes requirement statuses or invents execution evidence.
All 146 remain `unverified` against the full acceptance definition, even when
their automated local suites pass. Device installation, manual accessibility,
provider delivery and staging/visual approval are explicitly still open. The
optional `--release` check refuses a release while any requirement is unverified.
The catalog also includes the normative isolated backup/restore case. The
remaining unused IDs in the mandatory ranges and normative test groups must
also be completed before phase/launch sign-off.

Three Forms rows retain the original PRD wording plus Tejas's overriding decision:
no anonymous forms, declared name/email now, SSO/Google deferred, and optional
exact own-response copies only to the entered address, excluding file bytes and
private links. A receipt/notification policy must not be confused with that
respondent-requested copy.

The inventory generator remains deliberately conservative and preserves reviewed
mappings/statuses when refreshing inventory. Its ordinary extraction tests still
assert that a newly generated inventory cannot auto-approve anything.
