# Local GT infrastructure

Only `database/migrations` is the target schema. Never run the historical root
`supabase/migrations` against GT infrastructure. There are no imported source
records or automatic admin credentials.

Supabase CLI **2.121.0 is pinned in dev dependencies**. CLI 2.90.0 mis-splits function identifiers
containing `atomic` and fails otherwise valid PostgreSQL migrations. See the
[upstream parser defect](https://github.com/supabase/cli/issues/5062).

```sh
npm ci
npm run local:start
npm run setup:local-auth
npm run dev:api
# In another terminal:
npm run dev
```

`local:start` uses an isolated Colima profile named `gdg-gt` (4 CPUs, 4 GiB RAM,
40 GiB sparse virtual data disk). It does not reset the old default profile or
switch global Docker context. Reserve at least 8 GiB free host space; first-time
image downloads need several GiB. The generated migration preparer refuses
changes to prepared history. The bridge binds published ports only to loopback.

Platform Supabase Auth is enabled to generate local transport credentials;
signup is disabled. Application identities use our own opaque server sessions,
not Supabase Auth. Analytics, Studio, edge runtime, and source seeds are disabled.
The local mail catcher does not send provider email.

Current runtime status: **healthy and locally verified**. The prior default VM
recovered from metadata I/O errors after restart but still reused a damaged
Postgres image containing a zero-filled executable loader. Its data is preserved
in the stopped default profile; the project profile uses a fresh cache instead.
Some Node dependency files also failed to read correctly; reinstalling from the
unchanged lockfile restored them. Do not reset/delete the existing Colima disk.
The production build then blocked while copying an offloaded (`dataless`)
public image. All 16 unchanged tracked public files were restored byte-for-byte
from Git and their Git object hashes verified; no appearance/content changed.
The subsequent production build completed in 14.14 seconds.

If iCloud manages this Desktop folder, its Finder **Keep Downloaded** option can
prevent repeated eviction of working files. See
[Apple's file-status guidance](https://support.apple.com/guide/mac-help/mchlc994344b/mac).
No global iCloud/storage settings were changed by this recovery.

`setup:local-auth` generates `.env.server.local` and `.docs/local-auth.local`
(ignored, mode 0600), with a randomly generated development password and gate.
It refuses non-loopback targets, existing unrelated admins, production mode, or
credential resets. Open the private credentials file locally; never commit it.

The Node API binds to `127.0.0.1:8081`; Vite proxies `/api/v1` on port 8080.
Existing UI fixtures remain a separate development-only adapter; the UI has not
yet migrated to these real API endpoints. This is not full PRD completion.

Useful commands:

- `npm run local:status` — safe URL/status output, no credential banner.
- `npm run local:stop` — stops this stack with backup enabled; keeps data.
- `npm run test:db` — disposable PostgreSQL tests, including 100-client capacity.
- `npm run test:local-auth` — real same-origin HTTP auth and low-privilege denial.

Real HTTP auth tests exercise the actual shared limiter; repeated runs within
15 minutes can correctly receive 429. Do not clear protection tables to hide it.

For direct Docker diagnostics, use `docker --context colima-gdg-gt ...`. No cloud
credentials, source rows, real provider sends, or production deployment are used.
