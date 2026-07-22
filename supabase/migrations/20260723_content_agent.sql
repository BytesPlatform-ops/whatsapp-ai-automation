-- ============================================================================
-- General Content Agent — durable Supabase schema (tables + indexes + RLS)
-- ============================================================================
-- Apply ONCE in Supabase → SQL Editor → New query → Run. Safe to re-run
-- (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS / ENABLE RLS are
-- idempotent).
--
-- WHY THIS FILE EXISTS
--   The Python backend has no ORM/migration runner; it persists through the
--   shared `persistence.table()` layer, whose Supabase backend (`_SupabaseRepo`)
--   writes each record to `POST /rest/v1/<table>` as the normalized ROW envelope:
--       { id, tenant_id, created_at, updated_at, data (jsonb) }
--   PostgREST upsert uses `Prefer: resolution=merge-duplicates`, which resolves
--   on the PRIMARY KEY (`id`). So every content-agent table has that exact shape
--   (see backend/content_agent/store.py). Queryable fields live inside `data`
--   and are read via `data->>'field'`; the expression indexes below keep the hot
--   lookups (by content_type / status / document_id) fast.
--
--   Activate with:  PIXIE_PERSIST=supabase  (+ SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
--   In memory/file mode these tables are unused (local dev / tests stay hermetic).
--
-- SECURITY MODEL (identical to supabase/migrations/20260709_ai_receptionist.sql)
--   These tables are written/read ONLY by the backend using the Supabase
--   SERVICE-ROLE key, which BYPASSES RLS. The browser never queries them — all
--   product access goes through the Next.js /api/lab/content-agent proxy, which
--   resolves the workspace tenant SERVER-SIDE. So we ENABLE RLS with NO
--   permissive policy for `anon`/`authenticated`: those roles can read/write
--   nothing → zero cross-tenant leakage even over a direct connection.
-- ============================================================================

-- ── Tables (all share the envelope shape) ───────────────────────────────────

-- Generated written-content documents (title, status, folder, tags, settings,
-- current_version_id). One row per document.
CREATE TABLE IF NOT EXISTS "ca_documents" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

-- Immutable content versions (generated text + structured payload + generation
-- snapshot + provider/model/mock + usage). Never overwritten; a new row per
-- edit/regeneration keeps full history.
CREATE TABLE IF NOT EXISTS "ca_versions" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

-- Generation-job audit rows (content_type, status, request snapshot, provider,
-- model, result version ids). One row per persisted generation.
CREATE TABLE IF NOT EXISTS "ca_jobs" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

-- ── Indexes ─────────────────────────────────────────────────────────────────
-- Every table gets (tenant_id) + (tenant_id, created_at desc) — the two access
-- patterns the row repo uses (list_by_tenant, ordered). Hot per-table lookups
-- get expression indexes on the relevant data->>'field'.

CREATE INDEX IF NOT EXISTS "idx_ca_documents_tenant"       ON "ca_documents" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_ca_documents_created"      ON "ca_documents" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_ca_documents_type"         ON "ca_documents" ((data->>'content_type'));
CREATE INDEX IF NOT EXISTS "idx_ca_documents_status"       ON "ca_documents" ((data->>'status'));

CREATE INDEX IF NOT EXISTS "idx_ca_versions_tenant"        ON "ca_versions" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_ca_versions_created"       ON "ca_versions" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_ca_versions_document"      ON "ca_versions" ((data->>'document_id'));

CREATE INDEX IF NOT EXISTS "idx_ca_jobs_tenant"            ON "ca_jobs" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_ca_jobs_created"           ON "ca_jobs" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_ca_jobs_status"            ON "ca_jobs" ((data->>'status'));

-- ── Row Level Security (enable; no anon/authenticated policies → deny-all) ────
ALTER TABLE "ca_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ca_versions"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ca_jobs"      ENABLE ROW LEVEL SECURITY;
