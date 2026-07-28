-- ============================================================================
-- SEO Search-Intelligence layer — durable Supabase schema (tables + indexes + RLS)
-- ============================================================================
-- Companion to 20260728_seo.sql. Apply ONCE in Supabase → SQL Editor → Run.
-- Safe to re-run (all DDL is IF NOT EXISTS / ENABLE RLS — idempotent). Do NOT
-- auto-apply; the backend has no migration runner (see 20260728_seo.sql header).
--
-- Same envelope shape as every other Pixie durable table:
--     { id, tenant_id, created_at, updated_at, data (jsonb) }
-- Written/read ONLY by the backend via the Supabase SERVICE-ROLE key (bypasses
-- RLS). The browser never queries these — access flows through the Next.js
-- /api/lab/seo/* proxies, which resolve the workspace tenant SERVER-SIDE. RLS is
-- ENABLED with NO anon/authenticated policy → deny-all → zero cross-tenant leak.
--
-- Backing repositories: backend/seo/search_stores.py (one _AutoRepo per table).
-- NOTE: GA4 tables are named seo_analytics_* (no digits) so the digit-blind
-- migration-coverage regex matches the full table name.
--
-- ENTITIES (18)
--   seo_google_connections     — Google OAuth connections (GSC/GA4), sealed tokens
--   seo_google_properties      — discovered GSC/GA4 properties, mapped to sites
--   seo_gsc_sync_jobs          — durable Search Console sync executions
--   seo_gsc_query_rows         — Search Console search-analytics rows
--   seo_analytics_sync_jobs    — durable GA4 sync executions
--   seo_analytics_landing_rows — GA4 organic landing-page rows
--   seo_keyword_projects       — keyword projects (per site)
--   seo_keywords               — tracked/researched keywords + metrics + ranks
--   seo_keyword_metrics        — point-in-time provider metric snapshots
--   seo_keyword_clusters       — keyword clusters + intent + target page
--   seo_rank_jobs              — durable rank-check executions
--   seo_rank_snapshots         — per-keyword rank snapshots (SERP features etc.)
--   seo_competitors            — tracked competitor domains
--   seo_competitor_snapshots   — competitor visibility snapshots
--   seo_opportunities          — evidence-backed SEO opportunities + scores
--   seo_content_briefs         — durable content briefs (+ handoff ref)
--   seo_alerts                 — in-app SEO alerts
--   seo_fix_verification       — before/after fix-verification records
-- ============================================================================

-- ── Tables (all share the envelope shape) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS "seo_google_connections" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS "seo_google_properties" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS "seo_gsc_sync_jobs" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS "seo_gsc_query_rows" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS "seo_analytics_sync_jobs" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS "seo_analytics_landing_rows" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS "seo_keyword_projects" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS "seo_keywords" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS "seo_keyword_metrics" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS "seo_keyword_clusters" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS "seo_rank_jobs" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS "seo_rank_snapshots" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS "seo_competitors" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS "seo_competitor_snapshots" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS "seo_opportunities" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS "seo_content_briefs" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS "seo_alerts" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS "seo_fix_verification" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- Every table: (tenant_id) + (tenant_id, created_at DESC). Hot foreign keys and
-- filter fields get expression indexes on data->>'field'.

CREATE INDEX IF NOT EXISTS "idx_seo_google_connections_tenant" ON "seo_google_connections" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_google_connections_created" ON "seo_google_connections" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_google_connections_kind" ON "seo_google_connections" ((data->>'kind'));

CREATE INDEX IF NOT EXISTS "idx_seo_google_properties_tenant" ON "seo_google_properties" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_google_properties_created" ON "seo_google_properties" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_google_properties_connection" ON "seo_google_properties" ((data->>'connection_id'));
CREATE INDEX IF NOT EXISTS "idx_seo_google_properties_site" ON "seo_google_properties" ((data->>'site_id'));

CREATE INDEX IF NOT EXISTS "idx_seo_gsc_sync_jobs_tenant" ON "seo_gsc_sync_jobs" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_gsc_sync_jobs_created" ON "seo_gsc_sync_jobs" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_gsc_sync_jobs_status" ON "seo_gsc_sync_jobs" ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_seo_gsc_sync_jobs_property" ON "seo_gsc_sync_jobs" ((data->>'property_id'));

CREATE INDEX IF NOT EXISTS "idx_seo_gsc_query_rows_tenant" ON "seo_gsc_query_rows" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_gsc_query_rows_created" ON "seo_gsc_query_rows" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_gsc_query_rows_property" ON "seo_gsc_query_rows" ((data->>'property_id'));
CREATE INDEX IF NOT EXISTS "idx_seo_gsc_query_rows_date" ON "seo_gsc_query_rows" ((data->>'date'));

CREATE INDEX IF NOT EXISTS "idx_seo_analytics_sync_jobs_tenant" ON "seo_analytics_sync_jobs" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_analytics_sync_jobs_created" ON "seo_analytics_sync_jobs" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_analytics_sync_jobs_status" ON "seo_analytics_sync_jobs" ((data->>'status'));

CREATE INDEX IF NOT EXISTS "idx_seo_analytics_landing_rows_tenant" ON "seo_analytics_landing_rows" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_analytics_landing_rows_created" ON "seo_analytics_landing_rows" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_analytics_landing_rows_property" ON "seo_analytics_landing_rows" ((data->>'property_id'));
CREATE INDEX IF NOT EXISTS "idx_seo_analytics_landing_rows_date" ON "seo_analytics_landing_rows" ((data->>'date'));

CREATE INDEX IF NOT EXISTS "idx_seo_keyword_projects_tenant" ON "seo_keyword_projects" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_keyword_projects_created" ON "seo_keyword_projects" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_keyword_projects_site" ON "seo_keyword_projects" ((data->>'site_id'));

CREATE INDEX IF NOT EXISTS "idx_seo_keywords_tenant" ON "seo_keywords" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_keywords_created" ON "seo_keywords" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_keywords_project" ON "seo_keywords" ((data->>'project_id'));
CREATE INDEX IF NOT EXISTS "idx_seo_keywords_cluster" ON "seo_keywords" ((data->>'cluster_id'));
CREATE INDEX IF NOT EXISTS "idx_seo_keywords_normalized" ON "seo_keywords" ((data->>'normalized_keyword'));

CREATE INDEX IF NOT EXISTS "idx_seo_keyword_metrics_tenant" ON "seo_keyword_metrics" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_keyword_metrics_created" ON "seo_keyword_metrics" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_keyword_metrics_keyword" ON "seo_keyword_metrics" ((data->>'keyword_id'));

CREATE INDEX IF NOT EXISTS "idx_seo_keyword_clusters_tenant" ON "seo_keyword_clusters" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_keyword_clusters_created" ON "seo_keyword_clusters" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_keyword_clusters_project" ON "seo_keyword_clusters" ((data->>'project_id'));

CREATE INDEX IF NOT EXISTS "idx_seo_rank_jobs_tenant" ON "seo_rank_jobs" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_rank_jobs_created" ON "seo_rank_jobs" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_rank_jobs_status" ON "seo_rank_jobs" ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_seo_rank_jobs_project" ON "seo_rank_jobs" ((data->>'project_id'));

CREATE INDEX IF NOT EXISTS "idx_seo_rank_snapshots_tenant" ON "seo_rank_snapshots" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_rank_snapshots_created" ON "seo_rank_snapshots" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_rank_snapshots_keyword" ON "seo_rank_snapshots" ((data->>'keyword_id'));
CREATE INDEX IF NOT EXISTS "idx_seo_rank_snapshots_project" ON "seo_rank_snapshots" ((data->>'project_id'));
CREATE INDEX IF NOT EXISTS "idx_seo_rank_snapshots_date" ON "seo_rank_snapshots" ((data->>'date'));

CREATE INDEX IF NOT EXISTS "idx_seo_competitors_tenant" ON "seo_competitors" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_competitors_created" ON "seo_competitors" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_competitors_project" ON "seo_competitors" ((data->>'project_id'));

CREATE INDEX IF NOT EXISTS "idx_seo_competitor_snapshots_tenant" ON "seo_competitor_snapshots" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_competitor_snapshots_created" ON "seo_competitor_snapshots" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_competitor_snapshots_competitor" ON "seo_competitor_snapshots" ((data->>'competitor_id'));

CREATE INDEX IF NOT EXISTS "idx_seo_opportunities_tenant" ON "seo_opportunities" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_opportunities_created" ON "seo_opportunities" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_opportunities_site" ON "seo_opportunities" ((data->>'site_id'));
CREATE INDEX IF NOT EXISTS "idx_seo_opportunities_status" ON "seo_opportunities" ((data->>'status'));

CREATE INDEX IF NOT EXISTS "idx_seo_content_briefs_tenant" ON "seo_content_briefs" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_content_briefs_created" ON "seo_content_briefs" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_content_briefs_site" ON "seo_content_briefs" ((data->>'site_id'));

CREATE INDEX IF NOT EXISTS "idx_seo_alerts_tenant" ON "seo_alerts" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_alerts_created" ON "seo_alerts" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_alerts_status" ON "seo_alerts" ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_seo_alerts_site" ON "seo_alerts" ((data->>'site_id'));

CREATE INDEX IF NOT EXISTS "idx_seo_fix_verification_tenant" ON "seo_fix_verification" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_fix_verification_created" ON "seo_fix_verification" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_fix_verification_issue" ON "seo_fix_verification" ((data->>'issue_id'));

-- ── Row Level Security (enable; no anon/authenticated policies → deny-all) ───
ALTER TABLE "seo_google_connections"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_google_properties"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_gsc_sync_jobs"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_gsc_query_rows"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_analytics_sync_jobs"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_analytics_landing_rows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_keyword_projects"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_keywords"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_keyword_metrics"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_keyword_clusters"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_rank_jobs"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_rank_snapshots"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_competitors"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_competitor_snapshots"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_opportunities"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_content_briefs"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_alerts"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_fix_verification"       ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- MIGRATION CHECKLIST
--   [x] 18 tables created, each matching an _AutoRepo.table_name in
--       backend/seo/search_stores.py (ALL_REPOSITORIES)
--   [x] Every table has (tenant_id) + (tenant_id, created_at DESC) indexes
--   [x] Hot expression indexes on data->>'field' for FKs + status/date filters
--   [x] RLS ENABLED on all 18 tables (no anon/authenticated policy = deny-all)
--   [x] All DDL is IF NOT EXISTS — idempotent, safe to re-run
--   [x] GA4 tables named seo_analytics_* (no digits → migration regex matches)
--   [x] NOT auto-applied; apply once in Supabase SQL Editor
-- ============================================================================
