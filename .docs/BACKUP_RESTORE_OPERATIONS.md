# Isolated database backup and restore proof

Run `npm run test:backup-restore`. The same check runs in CI.

This creates two randomly named, purpose-labelled, network-isolated disposable
PostgreSQL databases. It never connects to the existing application database or
a hosted project. The source applies all canonical migrations and creates only
clearly fictional, disabled/retained fixtures. Its logical dump stays in process
memory and is streamed only to the new restore target. No backup with private
records is written under the workspace or served by Vite.

The restored database must have identical row counts and SHA-256 row-content
fingerprints for every public/security table, plus matching table/function/
constraint/index/RLS/policy/trigger inventories, plus view definitions, security
options and effective role grants. Tests then verify revoked browser
table/function grants, intended service-role function grants, foreign-key failure
and append-only audit protection. Negative tests must leave all fingerprints
unchanged. Only invocation-owned purpose-verified containers are removed on
success; failures are stopped and left recoverable for investigation.

Current local proof: 106 migrations, 130 application/security tables, 350
functions, 656 constraints, 458 indexes and 70 noninternal triggers. All six
checks pass, including the service-only public event inventory view. See
`phase0/local-backup-restore.json`. This proves the logical
application-schema restore path on the tested PostgreSQL version; it is not
evidence of hosted backups, point-in-time recovery, private object restoration,
encryption-key escrow or an institutional disaster-recovery exercise.

Before launch, the actual operator still needs to:

1. Configure the approved backup/PITR policy and restricted backup destination.
2. Restore a production-like backup into a separately restricted staging project.
3. Restore private/public object bytes and required encryption/signing keys from
   their approved stores; verify content hashes, associations and download access.
4. Reapply environment-specific controls, revoke copied live sessions/tokens and
   disable email/push/schedulers before any recovery smoke test.
5. Verify grants/RLS, private reads, finance/Forms holds, worker leases and audit
   continuity against the restored environment.
6. Measure and approve recovery-point/recovery-time objectives and record the
   actual operator, backup identifier, restore duration and sign-off.

The local script deliberately cannot turn these pending hosted steps into a
successful launch gate. No production recovery or destructive rollback is run by
this check.
