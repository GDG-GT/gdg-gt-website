# GT canonical database

Only `database/migrations/` contains the target migration chain. The old
`supabase/migrations/`, schemas, and seeds are historical source evidence, **not**
fresh-install instructions. Never run their permissive policies or sample users
on a GT environment.

The structural baseline is generated from an executed source reconstruction,
not guessed from SQL text. It includes all 62 source tables, constraints and
indexes, but no source records, grants, policies, functions, views or triggers.
Forward migrations own the target security, behavior and additional tables.

Deploying to staging/production requires explicit environment configuration and
the PRD gates. Local validation uses disposable, labeled, network-isolated
PostgreSQL containers. It does not certify Supabase Storage/Realtime behavior.

Reconstruction evidence: `.docs/phase0/source-replay-repaired.json`.
