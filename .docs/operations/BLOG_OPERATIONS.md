# Private editorial workflows

PRD BLOG-001–006 and §24.1. Articles, categories, submission review/discussion,
retained comment moderation and historical analytics now use protected server
APIs. Public Blog routes remain the branded not-found experience, without Blog
navigation, public APIs, anonymous table/RPC grants or Realtime publication.
Hosted HTTP-status/indexing acceptance remains part of final deployment testing.

## Authority and lifecycle

Current Admin/Super Admin accounts manage chapter and active-team writing.
Ordinary team accounts need active membership, Blog page access and explicit
CRUD grants for their owning scope. A Blog Editor reads/edits only articles they
created or were explicitly assigned, and reads/discusses only owned/assigned
submissions. Assignment does not grant unrelated systems. Team archival revokes
ordinary/assigned-editor access; administrators retain read-only historical scope.
Assignment and publication/moderation/review decisions require an administrator.

Article edits become proposed changes. They do not overwrite an existing retained
published base. New articles start draft/pending; administrator approval applies
the reviewed proposal. A separate confirmed publish operation sets only internal
publication state. Rejection retains proposal and base, with feedback; authors
can revise/resubmit. Categories are administrator-managed shared taxonomy.
Recoverable archive retains records, comments/likes and metadata; restoring an
article leaves it draft, and restoring a category leaves it inactive.

Current session/action checks are repeated inside the database transaction.
Mutations use CSRF, idempotency and aggregate revision checks. Sensitive decisions,
assignment, moderation and archive/restore require the current password and a
named record acknowledgement. The UI supplies the selected BLOG reference
automatically, including on identical replays. Stored editorial versions retain
business document snapshots, separate from append-only audit metadata. List DTOs
omit article bodies, proposed document payloads and private author email.
Submission DTOs never expose storage paths; editor views also omit submitter
contact, administrator notes and administrator-only discussion. Comment DTOs omit
private commenter email. Analytics expose actual retained counts separately from
legacy counters, never voter identifiers; there is no new public analytics.

## Text and file safety

Writing uses a shared Markdown AST policy on write and again on render: raw HTML
nodes, unsafe destinations and automatic Markdown image loads are removed.
Literal fenced code is preserved/escaped. HTTPS links require explicit clicks,
no referrer and safe external-link attributes. Rich preview never uses raw HTML
rendering. Discussions/notes render as plain escaped text. Remote image/avatar
URLs remain metadata and are not auto-loaded in this private preview.

The workspace does **not** mark legacy file paths safe. Submission metadata
starts unverified and provides no download bypass. The forward file checkpoint
adds real quarantine, checksum/MIME/ClamAV verification, current-scope promotion
rechecks and short-lived audited downloads for newly scanned editorial files;
see BLOG_FILE_OPERATIONS.md. Dedicated local blog-submissions storage is private.
Legacy-file import, hosted bucket verification, the browser-picker handoff and
general media/gallery acceptance remain open; this is not a full launch claim.

## Local verification

61 canonical migrations and the full SQL suite, including both 100-client
capacity regressions, pass. Unit suite: 260 tests. The real local HTTP suite
records 35 checks in ../phase0/local-blog-integration.json: ownership, scoped counts,
state/ownership injection, write sanitization, proposal/base preservation,
independent stale approval, assignment revocation, administrator-only discussion,
moderation, retained analytics, team/account revocation and recoverable history.
Exact fictional fixtures are archived, not deleted. No real upload, person,
public Blog, external provider or email was used.

Browser evidence in ../ui-review/real-blog-*.png covers real proposal save and
password-confirmed approval, safe code rendering, independent update preserving
unsaved input/disabled saving, collection-navigation Stay/discard, an unchanged
editor closing without a prompt, actual retained submission discussion, and a
375 px document/339 px editor without root overflow. Temporary mobile viewport
was reset and its tab closed. The source tables/history remain intact.

Comprehensive role-by-role browser, accessibility, load/hosted, media/download
and all remaining PRD acceptance are still open. Dependency installation also
reported 42 audit findings (25 high); no bulk or forced dependency rewrite was
attempted, and dependency/security remediation remains a final gate.
