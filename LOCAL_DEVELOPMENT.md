# Local development

Use the existing isolated `gdg-gt` Supabase profile, Node API and browser UI. The production website is already deployed; local commands operate on the local stack unless a tool explicitly documents otherwise.

## Start or resume

Use Node 24 for consistency with CI/production and install the locked dependencies with `npm ci` on a fresh checkout.

```sh
npm run local:status
npm run local:start
# Separate terminals:
npm run dev:api
npm run dev
```

Open `http://127.0.0.1:8080`. The API is loopback-only on port 8081. Inspect existing services before starting duplicates. Preserve an existing database; startup does not require a reset.

- Browser configuration: ignored `.env.local`.
- Private server configuration: ignored `.env.server.local`.
- Existing local sign-in details: ignored `.docs/local-auth.local`.
- The Colima-backed Docker context is `colima-gdg-gt` where available.

Keep local credentials private. Do not copy production credentials into browser variables or commit local state. The earlier sample-data-only UI and its public preview credentials are retired.

## Database, files and workers

Read the [local runtime guide](.docs/operations/LOCAL_RUNTIME.md) before database or storage work. Canonical migration sources are `database/migrations`; `npm run db:prepare` creates the ignored local target under `infra/supabase/migrations`. Applied migration files are immutable. New schema changes require forward migrations.

Relevant worker commands, in their own terminals when needed:

```sh
npm run jobs:scheduler -- --watch
npm run jobs:uploads -- --watch
npm run jobs:form-exports -- --watch
```

Storage, antivirus, media processing and worker configuration have prerequisites in the [operations index](.docs/operations/README.md). Local mail defaults to Mailpit. Do not enable real provider delivery for fictional local tests.

The active `node_modules` installation is separate from generated assets copied during builds. Superseded offloaded dependency/font backups are removed by the repository cleanup; no application code depends on them. Recreate dependencies with `npm ci` and served editor assets with the normal build preparation scripts.

## Checks

```sh
npm run typecheck
npm run lint -- --max-warnings=10
npm run test:coverage
npm run test:db
npm run build
npm run test:bundles
npm run test:public-ssr
```

Use `npm run test:event-membership` for the separate event schema and `npm run test:browser` for fictional browser regression cases. Keep tests on their documented local/disposable targets. See [verification notes](.docs/verification/README.md).

## Current state and further work

[Production status](.docs/PRODUCTION_LAUNCH_STATUS.md) records verified deployment/configuration. [Implementation status](.docs/IMPLEMENTATION_STATUS.md) distinguishes implemented features from provider/device activation and human acceptance. [PRODUCT.md](PRODUCT.md) records current owner decisions. Historical checkpoints and rejected design iterations are not current setup instructions.
