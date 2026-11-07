# GDG at Georgia Tech

Public chapter website and private operating workspace for Google Developer
Group on Campus at Georgia Institute of Technology. The implementation follows
[PRD v1.5](.docs/GDG_GT_WEBSITE_PRD_v1.5.md) and the later user decisions recorded
in [PRODUCT.md](PRODUCT.md).

The project is under local implementation and acceptance review. Current
completion limits and verification evidence are recorded in
[the implementation status](.docs/IMPLEMENTATION_STATUS.md) and
[the local acceptance audit](.docs/LOCAL_ACCEPTANCE_AUDIT.md). Passing local tests
does not certify deployment, approved chapter content, device behavior or full
PRD acceptance.

## Local development

Use Node.js **20.x (20.19+) or >=22.12** and npm. CI uses Node 24. Vite and React Router
require these supported runtimes; the package manifest declares the range.

On a fresh checkout, install the locked dependencies:

```sh
npm ci
```

Follow the [dedicated local runtime guide](.docs/LOCAL_RUNTIME.md) for the isolated
database, private server configuration, scanner and background workers. Resume an
existing configured workspace by inspecting its status first:

```sh
npm run local:status
# Start only missing services, in separate terminals as needed:
npm run local:start
npm run dev:api
npm run dev
```

The website runs at `http://127.0.0.1:8080`; same-origin API requests reach the
local Node service on port 8081. Server credentials belong in ignored local
configuration. Browser environment variables must never contain private keys.
Preserve an existing database and use the canonical migration workflow in the
runtime guide; routine startup does not require a database reset.

## Application areas

- Public chapter pages: events and registration, team, resources, sponsors,
  approved gallery, contact and public information.
- Native Forms: versioned publishing, required respondent identity, optional
  own-response copies, branching, permitted uploads and private response review.
- Private workspace: content, events, community directory with CSV import/export,
  teams and permissions, communications, channels, whiteboards, finances, media,
  newsletter, Linktree, audit, privacy and operations.
- Blog and project management are private workspace features. Public discovery
  must not disclose their private content.
- PWA support includes an offline help document and explicitly queued public
  registrations/newsletter signups. Private workspace data and native Forms are
  not cached for offline completion. A server commit is required for acceptance.

SSO/Google verification and Bevy/Engage integration are deferred. Hosted domains,
providers and approved institutional settings require their own configuration
and acceptance; real provider delivery is not enabled by a local test result.

## Verification

```sh
npm run typecheck
npm run lint
npm run test:coverage
npm run build
npm run test:bundles
npm run test:traceability
npm run test:secrets
npm run test:browser
```

Browser verification uses the production preview at `http://127.0.0.1:4173` and
fictional fixtures across six browser/viewport profiles. It has no retries and
retains initial failure evidence. Actual Safari/devices, screen readers and real
browser zoom need separate review. See
[the populated visual review](.docs/POPULATED_VISUAL_REVIEW.md),
[navigation checks](.docs/WORKSPACE_NAVIGATION_CHECKS.md),
[public-entry performance](.docs/PUBLIC_ENTRY_PERFORMANCE.md) and
[dependency review](.docs/DEPENDENCY_SECURITY_REVIEW.md).

The database/API integration scripts listed in `package.json` use an isolated
local stack and owned fictional actors. Read their documented prerequisites and
cleanup rules before running them. They are not production maintenance commands.

## Source layout

- `src/ui`, `src/pages`, `src/components`: public and private React interfaces.
- `src/pwa`: deliberate worker lifecycle, offline help and bounded public queue.
- `server`, `api`: application authority, same-origin HTTP handlers and deployment
  adapters; database credentials stay server-side.
- `shared`: validation and policy shared by the relevant server/browser paths.
- `database/migrations`: canonical schema, grants, RLS and recovery migrations.
- `scripts`, `tests`: local runtime, integration, source/byte/security gates,
  unit/coverage and browser verification.
- `.docs`: PRD, design direction, operational notes and scoped acceptance evidence.

Use [the saved checkpoint](.docs/CURRENT_CHECKPOINT.md) to resume unfinished work
without replaying completed mutations. Deployment, production changes, purchases
and real provider sends require separate authorization from the current local task.
