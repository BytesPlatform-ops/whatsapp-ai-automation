-- ============================================================================
-- SEO Crawler Pipeline — durable Supabase schema (tables + indexes + RLS)
-- ============================================================================
-- Apply ONCE in Supabase → SQL Editor → New query → Run. Safe to re-run
-- (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS / ENABLE RLS are
-- idempotent). Do NOT auto-apply; the backend migration runner does not run
-- these files automatically.
--
-- WHY THIS FILE EXISTS
--   The Python backend has no ORM/migration runner; it persists through the
--   shared `persistence.table()` layer, whose Supabase backend (`_SupabaseRepo`)
--   writes each record to `POST /rest/v1/<table>` as the normalized ROW envelope:
--       { id, tenant_id, created_at, updated_at, data (jsonb) }
--   PostgREST upsert uses `Prefer: resolution=merge-duplicates`, which resolves
--   on the PRIMARY KEY (`id`). So every SEO table has that exact shape
--   (see backend/seo/stores.py). Queryable fields live inside `data` and are
--   read via `data->>'field'`; the expression indexes below keep the hot
--   lookups (by site_id / status / severity / normalized_url) fast.
--
--   Activate with:  PIXIE_PERSIST=supabase  (+ SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
--   In memory/file mode these tables are unused (local dev / tests stay hermetic).
--
-- SECURITY MODEL (identical to supabase/migrations/20260723_content_agent.sql)
--   These tables are written/read ONLY by the backend using the Supabase
--   SERVICE-ROLE key, which BYPASSES RLS. The browser never queries them — all
--   product access goes through the Next.js /api/lab/* proxies, which resolve
--   the workspace tenant SERVER-SIDE. We ENABLE RLS with NO permissive policy
--   for `anon`/`authenticated`: those roles can read/write nothing →
--   zero cross-tenant leakage even over a direct connection.
--
-- ENTITIES
--   seo_sites         — registered domains/properties per tenant
--   seo_crawl_jobs    — crawl executions (queued→running→completed/failed)
--   seo_crawled_pages — per-URL crawl results (title/meta/links/scores)
--   seo_issues        — rule-based SEO problems found during a crawl
--   seo_reports       — aggregate scores + issue counts per crawl job
-- ============================================================================

-- ── Tables (all share the envelope shape) ───────────────────────────────────

-- Registered sites/properties. One row per (tenant, domain).
-- Hot fields in data: domain, connection_status, crawl_frequency.
CREATE TABLE IF NOT EXISTS "seo_sites" (
  "id"         text        PRIMARY KEY,
  "tenant_id"  text        NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data"       jsonb       NOT NULL DEFAULT '{}'::jsonb
);

-- Crawl job executions. status lifecycle: queued→running→completed|failed|cancelled.
-- Hot fields in data: site_id, status, crawl_type.
CREATE TABLE IF NOT EXISTS "seo_crawl_jobs" (
  "id"         text        PRIMARY KEY,
  "tenant_id"  text        NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data"       jsonb       NOT NULL DEFAULT '{}'::jsonb
);

-- Per-URL crawl results. Append-only per crawl job (never overwritten).
-- Hot fields in data: site_id, crawl_job_id, normalized_url.
CREATE TABLE IF NOT EXISTS "seo_crawled_pages" (
  "id"         text        PRIMARY KEY,
  "tenant_id"  text        NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data"       jsonb       NOT NULL DEFAULT '{}'::jsonb
);

-- Rule-based SEO issues. status lifecycle: open→resolved|ignored.
-- Hot fields in data: site_id, crawl_job_id, severity, status.
CREATE TABLE IF NOT EXISTS "seo_issues" (
  "id"         text        PRIMARY KEY,
  "tenant_id"  text        NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data"       jsonb       NOT NULL DEFAULT '{}'::jsonb
);

-- Aggregate score reports per crawl job. One row per (site, crawl_job).
-- Hot fields in data: site_id, crawl_job_id.
CREATE TABLE IF NOT EXISTS "seo_reports" (
  "id"         text        PRIMARY KEY,
  "tenant_id"  text        NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data"       jsonb       NOT NULL DEFAULT '{}'::jsonb
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- Every table: (tenant_id) + (tenant_id, created_at desc) — the two access
-- patterns the row repo uses (list_by_tenant, ordered).
-- Hot per-table lookups get expression indexes on the relevant data->>'field'.

-- seo_sites
CREATE INDEX IF NOT EXISTS "idx_seo_sites_tenant"
  ON "seo_sites" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_sites_created"
  ON "seo_sites" ("tenant_id", "created_at" DESC);

-- seo_crawl_jobs
CREATE INDEX IF NOT EXISTS "idx_seo_crawl_jobs_tenant"
  ON "seo_crawl_jobs" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_crawl_jobs_created"
  ON "seo_crawl_jobs" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_crawl_jobs_site_id"
  ON "seo_crawl_jobs" ((data->>'site_id'));
CREATE INDEX IF NOT EXISTS "idx_seo_crawl_jobs_status"
  ON "seo_crawl_jobs" ((data->>'status'));

-- seo_crawled_pages
CREATE INDEX IF NOT EXISTS "idx_seo_crawled_pages_tenant"
  ON "seo_crawled_pages" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_crawled_pages_created"
  ON "seo_crawled_pages" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_crawled_pages_site_id"
  ON "seo_crawled_pages" ((data->>'site_id'));
CREATE INDEX IF NOT EXISTS "idx_seo_crawled_pages_crawl_job_id"
  ON "seo_crawled_pages" ((data->>'crawl_job_id'));
CREATE INDEX IF NOT EXISTS "idx_seo_crawled_pages_normalized_url"
  ON "seo_crawled_pages" ((data->>'normalized_url'));

-- seo_issues
CREATE INDEX IF NOT EXISTS "idx_seo_issues_tenant"
  ON "seo_issues" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_issues_created"
  ON "seo_issues" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_issues_site_id"
  ON "seo_issues" ((data->>'site_id'));
CREATE INDEX IF NOT EXISTS "idx_seo_issues_crawl_job_id"
  ON "seo_issues" ((data->>'crawl_job_id'));
CREATE INDEX IF NOT EXISTS "idx_seo_issues_severity"
  ON "seo_issues" ((data->>'severity'));
CREATE INDEX IF NOT EXISTS "idx_seo_issues_status"
  ON "seo_issues" ((data->>'status'));

-- seo_reports
CREATE INDEX IF NOT EXISTS "idx_seo_reports_tenant"
  ON "seo_reports" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_reports_created"
  ON "seo_reports" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_reports_site_id"
  ON "seo_reports" ((data->>'site_id'));

-- ── Row Level Security (enable; no anon/authenticated policies → deny-all) ───
ALTER TABLE "seo_sites"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_crawl_jobs"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_crawled_pages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_issues"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_reports"       ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- MIGRATION CHECKLIST (verify before applying)
--   [x] 5 tables created: seo_sites, seo_crawl_jobs, seo_crawled_pages,
--       seo_issues, seo_reports — each matching a repository in
--       backend/seo/stores.py (SiteRepository.table_name etc.)
--   [x] Every table has (tenant_id) + (tenant_id, created_at DESC) indexes
--   [x] Hot expression indexes on data->>'field':
--         crawl_jobs:    site_id, status
--         crawled_pages: site_id, crawl_job_id, normalized_url
--         issues:        site_id, crawl_job_id, severity, status
--         reports:       site_id
--   [x] RLS ENABLED on all 5 tables (no anon/authenticated policy = deny-all)
--   [x] All DDL is IF NOT EXISTS — idempotent, safe to re-run
--   [x] NOT auto-applied; apply once in Supabase SQL Editor
-- ============================================================================
