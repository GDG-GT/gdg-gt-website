# Documentation

Start with the maintained guides below. Current release state and owner decisions take precedence over dated implementation notes.

| Need | Document |
| --- | --- |
| Connect a future event website to member cards and registration checks | [Detailed event integration guide](operations/EVENT_MEMBERSHIP_INTEGRATION.md) |
| Issue cards, manage points/perks, configure member sign-in or Wallet | [Member rewards operations](operations/MEMBER_REWARDS_OPERATIONS.md) |
| Install the iPhone scanner, write physical cards and prepare Wallet NFC | [iPhone scanner and card writer](operations/IPHONE_SCANNER.md) |
| Configure Google Wallet and understand Android/Samsung support | [Android Wallet operations](operations/GOOGLE_SAMSUNG_WALLET.md) |
| Resume the current work safely | [Current checkpoint](CURRENT_CHECKPOINT.md) |
| See what is deployed and which external setup remains | [Production status](PRODUCTION_LAUNCH_STATUS.md) |
| Separate implementation from acceptance/configuration | [Implementation status](IMPLEMENTATION_STATUS.md) |
| Run the local project | [Local runtime](operations/LOCAL_RUNTIME.md) and [local development](../LOCAL_DEVELOPMENT.md) |
| Run production workers and understand runtime configuration | [Production runtime](operations/PRODUCTION_RUNTIME.md) |
| Review the latest product decisions | [Product register](../PRODUCT.md) |

## Specifications

The current specification is [PRD v1.5](GDG_GT_WEBSITE_PRD_v1.5.md), with the [revision 4.1 source audit](PSU_REPOSITORY_AUDIT_v4.md). Approved visual specifications stay at their stable paths: [master prompts](FINAL_DESIGN_PROMPTS.md), [design system](DESIGN_SYSTEM.md) and [page composition prompts](GDG_GT_UI_IMAGE_PROMPTS.md). Later owner decisions in PRODUCT.md supersede earlier product assumptions.

Superseded PRDs, the original migration/template quick start, rejected transformation plans and old checkpoint dumps have been retired. They are not setup instructions for this deployed application. Earlier tracked versions remain recoverable from Git; a private pre-cleanup recovery copy also preserves previously uncommitted notes outside the repository.

## Maintained sections

- [Operations](operations/README.md): runtime, domain workflows and maintenance procedures.
- [Planning](planning/README.md): GT SSO request/provider setup, event-platform research and device/reader constraints.
- [Engineering](engineering/README.md): implementation boundaries, recovery behavior and historical design decisions that remain useful for maintenance.
- [Verification](verification/README.md): test procedures, scope and dated review notes.
- `phase0`: protected audit/traceability inputs, reusable verification outputs and selected release evidence. This directory retains its path because repository tools use it.
- `ui-review`: retained review images, including the original source/reference assets. These are review material, not the served application asset directory.

The latest cross-event release record is [event-membership-live-release.json](phase0/event-membership-live-release.json). Older report counts describe their own runs. A successful traceability mapping does not itself mark requirements accepted; a passing automated build does not prove real provider/device or human visual/accessibility approval.

## Source and generated files

`database/migrations` is the canonical append-only schema history. Original Supabase migrations and audit fixtures remain because tooling uses them; they are not duplicate target migrations to deploy again.

Builds, coverage, dependencies and browser captures are generated. Keep current reports when useful; retired local test captures and offloaded dependency backups do not belong in the maintained source tree. Regenerate them with the documented locked installation/build/test commands. Keep `.docs/*.local` and `.env` state private and ignored.
