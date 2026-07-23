# Content persistence — Supabase application checklist

Both content products persist through the shared `persistence` envelope seam
(`{ id, tenant_id, created_at, updated_at, data jsonb }`, PK = `id`). Two
migrations create the durable tables. **Neither has been applied to a live
Supabase project** — apply only with explicit approval (see repo `CLAUDE.md`
migration rules).

## Migrations

| Product | File | Tables |
|---|---|---|
| AI Influencer (Content Creator) | `landing/prisma/migrations/0004_content_creator/migration.sql` | `cc_profiles`, `cc_identities`, `cc_provider_connections`, `cc_ideas`, `cc_scripts`, `cc_approvals`, `cc_videos`, `cc_quality_checks`, `cc_posts`, `cc_metrics`, `cc_usage`, `cc_learnings`, `cc_credentials` |
| General Content Agent | `supabase/migrations/20260723_content_agent.sql` | `ca_documents`, `ca_versions`, `ca_jobs`, `ca_usage` |

Coverage is enforced by `backend/tests/test_migration_and_import.py`, which fails
if code introduces a durable table not present in the migration.

## Validation (done — no live application)

- [x] Table names match the repository `table_name`s (`content_agent.store`,
      `content_creator.store_durable`).
- [x] Every table uses the envelope shape (`id` PK, `tenant_id`, timestamps,
      `data jsonb`) — matches `_SupabaseRepo` upsert (`Prefer: merge-duplicates` on `id`).
- [x] `(tenant_id)` + `(tenant_id, created_at desc)` indexes present (the two
      access patterns `list_by_tenant` uses).
- [x] Content Agent migration `ENABLE ROW LEVEL SECURITY` with no anon/authenticated
      policy → deny-all; backend uses the service-role key which bypasses RLS.
- [x] Ordering: `0004_content_creator` follows the existing Prisma chain; the
      Content Agent SQL is standalone and idempotent (`IF NOT EXISTS`).

## Application (requires explicit approval — do NOT run otherwise)

1. Apply `landing/prisma/migrations/0004_content_creator/migration.sql`
   (`cd landing && npm run db:migrate`, or paste into Supabase SQL editor).
2. Apply `supabase/migrations/20260723_content_agent.sql` (Supabase SQL editor).
3. Confirm the RLS posture for the `cc_*` tables matches
   `supabase/rls/pixie-services-rls.sql`.
4. Set backend env: `PIXIE_PERSIST=supabase`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, and `PIXIE_REQUIRE_DURABLE=true`.
5. Restart the backend; confirm the startup summary reports
   `persistence=supabase durable=True` and boots without error.
6. Migrate any existing local file data (non-destructive, dry-run first):
   ```
   PIXIE_DATA_DIR=backend/.pixie_data python scripts/import_file_persistence_to_supabase.py            # preview
   PIXIE_DATA_DIR=backend/.pixie_data SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
       python scripts/import_file_persistence_to_supabase.py --apply                                   # write
   ```
7. Smoke test: create a content document + an influencer profile, then restart and
   confirm both survive; verify cross-tenant reads return nothing.
8. Do NOT delete `.pixie_data` until the migrated records are verified in Supabase.

## Credits & billing (`20260725_credits.sql`, Phase 6.1) — NOT applied

Tables: `credit_ledger`, `credit_wallet`, `credit_reservations` (envelope shape;
indexes + unique `(tenant_id, idempotency_key)` + deny-all RLS). Contract verified by
`backend/tests/credits/test_durable.py`.

1. Apply `20260725_credits.sql` in the Supabase SQL editor (idempotent).
2. Import any local file billing data with the existing generic importer — dry-run
   first, `--on-conflict fail` for money data (financial ambiguity must fail safely):
   ```
   PIXIE_DATA_DIR=backend/.pixie_data python scripts/import_file_persistence_to_supabase.py \
       --only credit_ledger --only credit_wallet --only credit_reservations           # preview
   ```
3. Keep enforcement OFF until the tables exist and data is verified:
   `CREDIT_SYSTEM_ENABLED=false`, `BILLING_ENFORCEMENT_ENABLED=false`.
4. Only after wallet balances reconcile against the ledger in Supabase, enable
   `CREDIT_SYSTEM_ENABLED=true`, then separately `BILLING_ENFORCEMENT_ENABLED=true`.
   Never enable enforcement against non-durable (memory/file) storage.
