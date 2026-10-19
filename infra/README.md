# Local GT infrastructure

Only `database/migrations` is the target schema. Never run the historical root
`supabase/migrations` against GT infrastructure. There are no imported source
records or automatic admin credentials.

Use Supabase CLI **2.121.0 or newer**. CLI 2.90.0 mis-splits function identifiers
containing `atomic` and fails otherwise valid PostgreSQL migrations. See the
[upstream parser defect](https://github.com/supabase/cli/issues/5062).

1. Reserve at least 15 GB free host disk space before downloading the stack.
2. Run `npm run db:prepare` to copy canonical migrations into the ignored local
   work directory. The preparer refuses altered applied history.
3. Create a dedicated Docker bridge with
   `com.docker.network.bridge.host_binding_ipv4=127.0.0.1`.
4. Start the CLI using `--workdir infra --network-id gdg-gt-prd-loopback`.
   This project's config disables cloud Auth, analytics, edge runtime, Studio,
   and source seeds. The application uses its own opaque server sessions.
5. Verify published ports bind only to loopback before using the stack.

Current runtime status: **blocked by host disk exhaustion**. The old CLI replay
failed on its parser; the updated CLI image pull exhausted available storage.
Docker subsequently returned containerd metadata I/O errors. No target stack is
running. Do not repeatedly retry downloads until host space and Docker health
have been restored. Do not reset or delete the existing Colima disk to recover.

The versioned Node API can run with `npm run dev:api` after a private
`.env.server.local` is configured. It binds to `127.0.0.1:8081`; Vite proxies
`/api/v1` on port 8080. Missing server configuration fails closed. Existing UI
fixtures remain a separate development-only adapter, not real backend storage.
