-- ============================================================================
-- SEO Generated Reports — durable schema (table + indexes + RLS)
-- ============================================================================
-- Companion to 20260729_seo_search_intelligence.sql.
-- Apply ONCE in Supabase → SQL Editor → Run.
-- Safe to re-run (all DDL is IF NOT EXISTS / ENABLE RLS — idempotent).
--
-- Entity:
--   seo_generated_reports  — metadata for generated PDF/CSV/JSON report artifacts
--
-- Envelope shape (same as every other Pixie durable table):
--   { id, tenant_id, created_at, updated_at, data (jsonb) }
--
-- The data column carries: site_id, kind, date_from, date_to, byte_size,
-- sha256, expires_at, status, error.
--
-- PDF bytes are NOT stored here — they are held in-process cache and streamed
-- directly. Only metadata is persisted so history/audit is available.
--
-- Backing repository: backend/seo/reporting/store.py (GeneratedReportRepository)
--
-- RLS posture: ENABLED with NO anon/authenticated policy → deny-all.
-- The backend uses the SERVICE-ROLE key (bypasses RLS). The browser never
-- queries this table directly — access flows through /api/agents/seo/reports/pdf
-- which resolves tenant server-side from X-Pixie-Tenant header.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "seo_generated_reports" (
  "id"         text        PRIMARY KEY,
  "tenant_id"  text        NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data"       jsonb       NOT NULL DEFAULT '{}'::jsonb
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Fast per-tenant listing (newest first)
CREATE INDEX IF NOT EXISTS "seo_generated_reports_tenant_created"
  ON "seo_generated_reports" ("tenant_id", "created_at" DESC);

-- Per-site lookup
CREATE INDEX IF NOT EXISTS "seo_generated_reports_site"
  ON "seo_generated_reports" ("tenant_id", ("data"->>'site_id'));

-- Per-kind lookup
CREATE INDEX IF NOT EXISTS "seo_generated_reports_kind"
  ON "seo_generated_reports" ("tenant_id", ("data"->>'kind'));

-- Expiry housekeeping (e.g., periodic cleanup of expired entries)
CREATE INDEX IF NOT EXISTS "seo_generated_reports_expires"
  ON "seo_generated_reports" (("data"->>'expires_at'));

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE "seo_generated_reports" ENABLE ROW LEVEL SECURITY;

-- Deny-all posture: no SELECT/INSERT/UPDATE/DELETE policies for anon or
-- authenticated roles. All access is via the SERVICE-ROLE key (bypasses RLS).
-- Add a policy here only if a future Row-level access pattern is approved.
