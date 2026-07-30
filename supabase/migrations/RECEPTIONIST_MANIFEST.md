# AI Receptionist — Migration Manifest

Source of truth for receptionist table coverage. The contract test
`backend/tests/test_receptionist_migration_contract.py` enforces that every table
referenced by `receptionist.service.stores.ALL_TABLES` (plus the worker jobs
tables and the campaign store) is created by one of these migrations, has a tenant
index and RLS, and that the hot idempotency / period / expiry indexes exist.

| # | Filename | Purpose | Tables | Predecessors | Rollback |
|---|----------|---------|--------|--------------|----------|
| 1 | `20260709_ai_receptionist.sql` | Core CRM + conversation + workflow records | conversations, messages, actions, contacts, companies, bookings, quotes, callbacks, voicemails, waitlist, payments, tickets, escalations, tasks, reminders, optouts, business_profile, knowledge, campaign_replies | none | drop listed tables (dev only) |
| 2 | `20260730_receptionist_foundation.sql` | Config versioning, compliance, usage, worker, infra | message_index, locks, action_executions, configurations, config_versions, consent, suppression, dnc, usage_counters, campaign_optouts, campaigns, campaign_targets, send_log, worker_jobs, worker_attempts | migration 1 | drop listed tables (dev only) |

## Constraints & indexes (migration 2)

- **Idempotency**: `message_index.dedup_key`, `action_executions.idempotency_key`, `send_log.idempotency_key`, and `usage_counters` idempotency-marker rows (id-encoded).
- **Worker claim**: `worker_jobs.status`, `worker_jobs.run_at`, `worker_jobs.lock_expires_at`.
- **Lock expiry**: `locks.expires_at`, `locks.conversation_id`.
- **Active config**: `config_versions.status`, `config_versions.version`.
- **Usage period**: `usage_counters.metric`, `usage_counters.period_start`.
- **Suppression lookup**: `consent`/`suppression`/`dnc`/`campaign_optouts` on `lower(email)` + `phone` (+ `consent.channel`).

## RLS

Every table has RLS **enabled** with **no** `anon`/`authenticated` policy → deny-all.
Backend access is via the Supabase service-role key (bypasses RLS); the browser
never queries these tables directly (all access is via the Next.js `/api/lab/*`
proxies, which resolve the tenant server-side).

## Application status

- **Authored**: yes (both files present, idempotent SQL).
- **Applied to production**: **NO** — requires explicit approval. Use the
  `backend/scripts/receptionist_migrate.py` tool (`validate` / `dry-run` / `status`
  / `verify`) which defaults to dry-run and refuses production targets.
- **Data migration dependency**: local JSON onboarding/campaign records are imported
  separately via `backend/scripts/receptionist_import.py` (validate → dry-run →
  import → verify).
