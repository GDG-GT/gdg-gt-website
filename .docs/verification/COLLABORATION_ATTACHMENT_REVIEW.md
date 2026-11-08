# Preserved collaboration attachment contract review

Read-only source/target contract review, 2026-10-22. This closes the review question,
not a new file-sharing feature or broad collaboration acceptance.

The preserved source has latent `attachments`/`attachment_url` columns and TypeScript
types. Those alone are not an implemented upload workflow:

- `communicationsService.createTask` and `.sendMessage` explicitly insert empty
  attachment arrays. Their accepted input shapes contain no attachment/upload.
- `channelsService.sendMessage` always inserts text and accepts message/reply only.
- `TeamMessagingService.sendMessage` has an optional attachment URL parameter,
  but its preserved `components/admin/TeamChat` caller supplies only team, sender
  and text. No uploader or file-selection control exists on that source surface.
- PRD COMM-001..006 preserve operational communications and enforce scope; the
  explicit v1.5 storage table lists media, editorial, finance, contact and Forms
  uploads, not a separately specified collaboration-file workflow. CONTENT-004
  forbids reusing public media if internal attachments are later implemented.

The target therefore keeps collaboration text-only, explicitly says so in its UI,
rejects injected attachment properties through strict schemas and does not serve
legacy URL columns. Managed team chat uses the same scoped channel contract.
Regression tests already cover attachment-property rejection in
`tests/server/{tasks,direct-messages,channels}.test.mjs` and continue to pass in the
437-unit run. Existing HTTP/SQL collaboration evidence is separate; this source
inspection does not claim a fresh full browser/HTTP test of those modules.

Finance, editorial, contact and Forms attachments have their separately implemented
private-intent/scanner/download/retention workflows. Public media does not grant
access to them. No source attachment bytes or URLs were imported into the GT DB.

Adding a new private collaboration uploader would require its own explicit private
bucket/purpose, record scopes, per-message/task association, malware checks,
quota/retention and revocation contract. It is not silently inferred from unused
source columns or implemented as arbitrary links to public storage.
