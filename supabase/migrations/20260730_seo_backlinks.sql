-- ============================================================================
-- SEO Backlinks layer — durable Supabase schema (tables + indexes + RLS)
-- ============================================================================
-- Companion to 20260729_seo_search_intelligence.sql. Apply ONCE in Supabase
-- → SQL Editor → Run. Safe to re-run (all DDL is IF NOT EXISTS / ENABLE RLS
-- — idempotent). Do NOT auto-apply; the backend has no migration runner.
--
-- Same envelope shape as every other Pixie durable table:
--     { id, tenant_id, created_at, updated_at, data (jsonb) }
-- Written/read ONLY by the backend via the Supabase SERVICE-ROLE key (bypasses
-- RLS). The browser never queries these — access flows through the Next.js
-- /api/lab/seo/* proxies, which resolve the workspace tenant SERVER-SIDE. RLS is
-- ENABLED with NO anon/authenticated policy → deny-all → zero cross-tenant leak.
--
-- Backing repositories: backend/seo/backlinks/stores.py (ALL_REPOSITORIES).
--
-- ENTITIES (4)
--   seo_backlink_projects  — one project per site, tracks sync status/freshness
--   seo_backlinks          — individual backlinks with dedup_key unique guard
--   seo_referring_domains  — aggregated referring-domain records (domain unique per site)
--   seo_backlink_snapshots — point-in-time aggregate snapshots for velocity chart
--
-- NOTE: Table names contain NO DIGITS (migration-coverage regex is digit-blind).
-- ============================================================================

-- ── Tables (all share the envelope shape) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS "seo_backlink_projects" (
  "id"         text        PRIMARY KEY,
  "tenant_id"  text        NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data"       jsonb       NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS "seo_backlinks" (
  "id"         text        PRIMARY KEY,
  "tenant_id"  text        NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data"       jsonb       NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS "seo_referring_domains" (
  "id"         text        PRIMARY KEY,
  "tenant_id"  text        NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data"       jsonb       NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS "seo_backlink_snapshots" (
  "id"         text        PRIMARY KEY,
  "tenant_id"  text        NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data"       jsonb       NOT NULL DEFAULT '{}'::jsonb
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- Every table: (tenant_id) + (tenant_id, created_at DESC).
-- Hot filter fields get expression indexes on data->>'field'.
-- Dedup guards use partial unique indexes on JSONB expression columns.

-- seo_backlink_projects
CREATE INDEX IF NOT EXISTS "idx_seo_backlink_projects_tenant"
  ON "seo_backlink_projects" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_backlink_projects_created"
  ON "seo_backlink_projects" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_backlink_projects_site"
  ON "seo_backlink_projects" ((data->>'site_id'));
CREATE INDEX IF NOT EXISTS "idx_seo_backlink_projects_status"
  ON "seo_backlink_projects" ((data->>'sync_status'));

-- seo_backlinks
CREATE INDEX IF NOT EXISTS "idx_seo_backlinks_tenant"
  ON "seo_backlinks" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_backlinks_created"
  ON "seo_backlinks" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_backlinks_site"
  ON "seo_backlinks" ((data->>'site_id'));
CREATE INDEX IF NOT EXISTS "idx_seo_backlinks_source_domain"
  ON "seo_backlinks" ((data->>'source_domain'));
CREATE INDEX IF NOT EXISTS "idx_seo_backlinks_target_url"
  ON "seo_backlinks" ((data->>'target_url'));
CREATE INDEX IF NOT EXISTS "idx_seo_backlinks_status"
  ON "seo_backlinks" ((data->>'status'));
-- Dedup guard: (tenant_id, dedup_key) must be unique per site.
-- Postgres cannot place a UNIQUE constraint on a JSONB expression column
-- directly, so we use a partial unique index on the expression.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_seo_backlinks_dedup"
  ON "seo_backlinks" ("tenant_id", (data->>'dedup_key'));

-- seo_referring_domains
CREATE INDEX IF NOT EXISTS "idx_seo_referring_domains_tenant"
  ON "seo_referring_domains" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_referring_domains_created"
  ON "seo_referring_domains" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_referring_domains_site"
  ON "seo_referring_domains" ((data->>'site_id'));
CREATE INDEX IF NOT EXISTS "idx_seo_referring_domains_status"
  ON "seo_referring_domains" ((data->>'status'));
-- Dedup guard: one record per (tenant_id, domain) prevents duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_seo_referring_domains_domain"
  ON "seo_referring_domains" ("tenant_id", (data->>'domain'));

-- seo_backlink_snapshots
CREATE INDEX IF NOT EXISTS "idx_seo_backlink_snapshots_tenant"
  ON "seo_backlink_snapshots" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_backlink_snapshots_created"
  ON "seo_backlink_snapshots" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_backlink_snapshots_site"
  ON "seo_backlink_snapshots" ((data->>'site_id'));
CREATE INDEX IF NOT EXISTS "idx_seo_backlink_snapshots_date"
  ON "seo_backlink_snapshots" ((data->>'date'));

-- ── Row Level Security (enable; no anon/authenticated policies → deny-all) ───
ALTER TABLE "seo_backlink_projects"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_backlinks"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_referring_domains"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_backlink_snapshots" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- MIGRATION CHECKLIST
--   [x] 4 tables created, each matching a _AutoRepo.table_name in
--       backend/seo/backlinks/stores.py (ALL_REPOSITORIES)
--   [x] Every table has (tenant_id) + (tenant_id, created_at DESC) indexes
--   [x] Hot expression indexes on data->>'field' for site_id/domain/status/date
--   [x] UNIQUE partial index on seo_backlinks (tenant_id, dedup_key) — dedup guard
--   [x] UNIQUE partial index on seo_referring_domains (tenant_id, domain) — dedup guard
--   [x] RLS ENABLED on all 4 tables (no anon/authenticated policy = deny-all)
--   [x] All DDL is IF NOT EXISTS — idempotent, safe to re-run
--   [x] Table names contain NO DIGITS
--   [x] NOT auto-applied; apply once in Supabase SQL Editor
-- ============================================================================
