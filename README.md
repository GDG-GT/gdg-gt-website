# GDG at Georgia Tech

Public chapter website and private operating workspace for Google Developer Group on Campus at Georgia Institute of Technology.

- Website: https://gdggt.dev
- Member leaderboard: https://leaderboards.gdggt.dev/
- Repository: https://github.com/GDG-GT/gdg-gt-website
- [Documentation index](.docs/README.md)
- [Current release and configuration status](.docs/PRODUCTION_LAUNCH_STATUS.md)
- [Separate event websites, membership and NFC integration](.docs/operations/EVENT_MEMBERSHIP_INTEGRATION.md)

The implementation follows [PRD v1.5](.docs/GDG_GT_WEBSITE_PRD_v1.5.md), the approved visual specifications and the later owner decisions in [PRODUCT.md](PRODUCT.md). Production is live on Vercel and Supabase. Passing automated checks does not establish physical-device compatibility, institutional SSO approval or human visual/accessibility acceptance.

## Local development

Use the locked dependencies with Node.js 20.x (20.19+) or >=22.12; CI and production use Node 24. Start a fresh checkout with `npm ci`. For an already configured workspace, inspect its status before starting missing services:

```sh
npm run local:status
npm run local:start
# In separate terminals, as needed:
npm run dev:api
npm run dev
```

Open `http://127.0.0.1:8080`; the local Node API listens on loopback port 8081. Follow [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) and the [local runtime guide](.docs/operations/LOCAL_RUNTIME.md) for database, scanner, storage and worker setup. Preserve existing local databases. Private configuration belongs in ignored local files, never browser environment variables or Git.

## Application areas

- Public chapter pages: events, registration, team, resources, sponsors, approved gallery and contact.
- Native Forms: versioned publishing, identified respondents, branching, permitted uploads, private response review and optional own-response email copies.
- Private workspace: community directory and CSV transfer, teams and permissions, content, communications, channels, whiteboards, finances, media, newsletter, Linktree, audit, privacy and operations.
- Blog and project management remain private workspace features.
- Standalone chapter links and Forms pages; a dedicated leaderboard/member subdomain; Super Admin points, perks, NFC/QR credentials and separate-event attendance integration.
- PWA support includes offline help and bounded public submission queues. Private workspace data and Forms are not available for offline completion; server confirmation is required.

GT member SSO is implemented behind configuration and awaits institutional/provider validation. Admin/Form SSO remains a separate planned workflow. Google sign-in is excluded by the owner's decision. GDG community/GT Engage integration is documented research. Email uses Resend; browser push uses Web Push/VAPID. Wallet NFC remains gated on issuer credentials and verified reader compatibility.

## Verification

```sh
npm run typecheck
npm run lint -- --max-warnings=10
npm run test:coverage
npm run test:db
npm run test:db:legacy-grants
npm run test:event-membership
npm run build
npm run test:bundles
npm run test:public-ssr
npm run test:traceability
npm run test:secrets
npm run test:browser
```

Browser tests use fictional fixtures across six browser/viewport profiles on the production preview at `http://127.0.0.1:4173`. Database tests use isolated disposable PostgreSQL or the documented local stack. These commands are not instructions to reset production or send messages to actual participants. See the [verification index](.docs/verification/README.md) for scope and evidence limits.

## Source layout

| Folder | Purpose |
| --- | --- |
| `src` | Public/private React interfaces, local UI helpers, PWA and public rendering |
| `server`, `api` | Server authority, HTTP endpoints and hosting adapters |
| `shared` | Shared validation and policy |
| `public`, `content` | Served assets and chapter content inputs |
| `database/migrations` | Canonical append-only database history |
| `supabase` | Original migration/audit inputs and Supabase functions |
| `infra` | Local Supabase configuration and generated local migration target |
| `integrations/event-membership` | Portable adapter and schema for a separate event project |
| `scripts`, `tests` | Development, operational tools and automated checks |
| `.docs` | Current specifications, grouped maintained notes and selected evidence |

Use [CURRENT_CHECKPOINT.md](.docs/CURRENT_CHECKPOINT.md) when resuming work. Operational procedures are in [.docs/operations](.docs/operations/README.md). Treat dated engineering/verification reports as records of their stated runs, not the current production status. Generated build output, dependency caches and old test captures are not source.
