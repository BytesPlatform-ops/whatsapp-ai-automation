-- ============================================================================
-- Social publishing (Phase 5) — durable Supabase schema (tables + indexes + RLS)
-- ============================================================================
-- Apply ONCE in Supabase → SQL Editor. Idempotent (IF NOT EXISTS). Safe to re-run.
--
-- The publishing engine persists through the shared `persistence.table()` envelope
-- ({ id, tenant_id, created_at, updated_at, data jsonb }, PK = id) — see
-- backend/publishing/store.py. Publish jobs + attempts carry NO tokens (tokens
-- live only in the existing Meta connection store / pixie_kv, service-role only).
--
-- SECURITY: written/read ONLY by the backend service-role key (bypasses RLS). The
-- browser never queries these — all access is via the Next.js /api/publishing +
-- /api/social proxies which resolve the workspace tenant server-side. RLS is
-- ENABLED with no anon/authenticated policy → deny-all.
-- ============================================================================

-- Publish jobs (one row per scheduled/immediate publish). Queryable fields live in
-- data (status, platform, source_product, scheduled_utc) via data->>'field'.
CREATE TABLE IF NOT EXISTS "pub_jobs" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

-- Publish attempts (append-only per job). Safe metadata only (no secrets/raw payloads).
CREATE TABLE IF NOT EXISTS "pub_attempts" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_pub_jobs_tenant"     ON "pub_jobs" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_pub_jobs_created"    ON "pub_jobs" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_pub_jobs_status"     ON "pub_jobs" ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_pub_jobs_platform"   ON "pub_jobs" ((data->>'platform'));
CREATE INDEX IF NOT EXISTS "idx_pub_jobs_scheduled"  ON "pub_jobs" ((data->>'scheduled_utc'));
CREATE INDEX IF NOT EXISTS "idx_pub_jobs_fingerprint" ON "pub_jobs" ((data->>'fingerprint'));

CREATE INDEX IF NOT EXISTS "idx_pub_attempts_tenant" ON "pub_attempts" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_pub_attempts_job"    ON "pub_attempts" ((data->>'job_id'));

-- ── Row Level Security (enable; no anon/authenticated policies → deny-all) ────
ALTER TABLE "pub_jobs"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pub_attempts" ENABLE ROW LEVEL SECURITY;
