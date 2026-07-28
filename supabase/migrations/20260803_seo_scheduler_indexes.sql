-- ============================================================================
-- Migration: 20260803_seo_scheduler_indexes
-- Purpose:   Expression indexes for SEO scheduler-relevant tables and
--            the seo_usage_counters + seo_alert_schedule tables.
-- Author:    backend-api agent
-- Date:      2026-08-03
--
-- Design:    All scheduler sources query job rows via PostgREST using JSONB
--            expression filters: data->>'status', data->>'next_run',
--            data->>'lock_expires_at', data->>'priority', etc.
--            Without expression indexes these scans are sequential (O(n)).
--            With them, PostgREST can use the index for equality + range filters.
--
-- Idempotent: all statements use CREATE INDEX IF NOT EXISTS.
-- RLS:        seo_usage_counters has RLS DENY-ALL (service-role only).
--             seo_alert_schedule has RLS DENY-ALL.
-- ============================================================================

-- ── seo_rank_jobs ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_seo_rank_jobs_status
    ON seo_rank_jobs ((data->>'status'));

CREATE INDEX IF NOT EXISTS idx_seo_rank_jobs_next_run
    ON seo_rank_jobs ((data->>'next_run'));

CREATE INDEX IF NOT EXISTS idx_seo_rank_jobs_lock_expires_at
    ON seo_rank_jobs ((data->>'lock_expires_at'));

CREATE INDEX IF NOT EXISTS idx_seo_rank_jobs_priority
    ON seo_rank_jobs ((data->>'priority'));

CREATE INDEX IF NOT EXISTS idx_seo_rank_jobs_provider
    ON seo_rank_jobs ((data->>'provider'));

CREATE INDEX IF NOT EXISTS idx_seo_rank_jobs_tenant_status
    ON seo_rank_jobs (tenant_id, (data->>'status'));

-- ── seo_gsc_sync_jobs ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_seo_gsc_sync_jobs_status
    ON seo_gsc_sync_jobs ((data->>'status'));

CREATE INDEX IF NOT EXISTS idx_seo_gsc_sync_jobs_queued_at
    ON seo_gsc_sync_jobs ((data->>'queued_at'));

CREATE INDEX IF NOT EXISTS idx_seo_gsc_sync_jobs_lock_expires_at
    ON seo_gsc_sync_jobs ((data->>'lock_expires_at'));

CREATE INDEX IF NOT EXISTS idx_seo_gsc_sync_jobs_tenant_status
    ON seo_gsc_sync_jobs (tenant_id, (data->>'status'));

-- ── seo_analytics_sync_jobs (GA4) ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_seo_analytics_sync_jobs_status
    ON seo_analytics_sync_jobs ((data->>'status'));

CREATE INDEX IF NOT EXISTS idx_seo_analytics_sync_jobs_queued_at
    ON seo_analytics_sync_jobs ((data->>'queued_at'));

CREATE INDEX IF NOT EXISTS idx_seo_analytics_sync_jobs_lock_expires_at
    ON seo_analytics_sync_jobs ((data->>'lock_expires_at'));

CREATE INDEX IF NOT EXISTS idx_seo_analytics_sync_jobs_tenant_status
    ON seo_analytics_sync_jobs (tenant_id, (data->>'status'));

-- ── seo_crawl_jobs ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_seo_crawl_jobs_status
    ON seo_crawl_jobs ((data->>'status'));

CREATE INDEX IF NOT EXISTS idx_seo_crawl_jobs_lock_expires_at
    ON seo_crawl_jobs ((data->>'lock_expires_at'));

CREATE INDEX IF NOT EXISTS idx_seo_crawl_jobs_tenant_status
    ON seo_crawl_jobs (tenant_id, (data->>'status'));

-- ── seo_fix_verification ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_seo_fix_verification_result
    ON seo_fix_verification ((data->>'result'));

CREATE INDEX IF NOT EXISTS idx_seo_fix_verification_status
    ON seo_fix_verification ((data->>'status'));

CREATE INDEX IF NOT EXISTS idx_seo_fix_verification_tenant_result
    ON seo_fix_verification (tenant_id, (data->>'result'));

-- ── seo_outreach_followups ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_seo_outreach_followups_status
    ON seo_outreach_followups ((data->>'status'));

CREATE INDEX IF NOT EXISTS idx_seo_outreach_followups_scheduled_for
    ON seo_outreach_followups ((data->>'scheduled_for'));

CREATE INDEX IF NOT EXISTS idx_seo_outreach_followups_tenant_status
    ON seo_outreach_followups (tenant_id, (data->>'status'));

-- ── seo_backlink_projects ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_seo_backlink_projects_status
    ON seo_backlink_projects ((data->>'status'));

CREATE INDEX IF NOT EXISTS idx_seo_backlink_projects_next_run
    ON seo_backlink_projects ((data->>'next_run'));

CREATE INDEX IF NOT EXISTS idx_seo_backlink_projects_provider
    ON seo_backlink_projects ((data->>'provider'));

-- ── seo_gbp_sync_jobs ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_seo_gbp_sync_jobs_status
    ON seo_gbp_sync_jobs ((data->>'status'));

CREATE INDEX IF NOT EXISTS idx_seo_gbp_sync_jobs_next_run
    ON seo_gbp_sync_jobs ((data->>'next_run'));

-- ── seo_citation_jobs ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_seo_citation_jobs_status
    ON seo_citation_jobs ((data->>'status'));

CREATE INDEX IF NOT EXISTS idx_seo_citation_jobs_next_run
    ON seo_citation_jobs ((data->>'next_run'));

-- ── seo_link_placements ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_seo_link_placements_status
    ON seo_link_placements ((data->>'status'));

CREATE INDEX IF NOT EXISTS idx_seo_link_placements_next_check_at
    ON seo_link_placements ((data->>'next_check_at'));

-- ── seo_report_schedules ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_seo_report_schedules_status
    ON seo_report_schedules ((data->>'status'));

CREATE INDEX IF NOT EXISTS idx_seo_report_schedules_next_run
    ON seo_report_schedules ((data->>'next_run'));

-- ── seo_alert_schedule (NEW scheduling table for alert_gen source) ──────────
-- One row per (tenant_id, site_id). next_run controls when generate_alerts
-- is called. Eliminates the full site-table scan in the alert_gen source.
CREATE TABLE IF NOT EXISTS seo_alert_schedule (
    id         text primary key,
    tenant_id  text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    data       jsonb not null default '{}'::jsonb
    -- data fields: { site_id, next_run, status, interval_s }
);

CREATE INDEX IF NOT EXISTS idx_seo_alert_schedule_status
    ON seo_alert_schedule ((data->>'status'));

CREATE INDEX IF NOT EXISTS idx_seo_alert_schedule_next_run
    ON seo_alert_schedule ((data->>'next_run'));

CREATE INDEX IF NOT EXISTS idx_seo_alert_schedule_tenant_status
    ON seo_alert_schedule (tenant_id, (data->>'status'));

-- Unique constraint: one schedule row per (tenant_id, site_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_alert_schedule_unique_site
    ON seo_alert_schedule (tenant_id, (data->>'site_id'));

-- RLS: deny all public access; service-role bypasses RLS automatically.
ALTER TABLE seo_alert_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_seo_alert_schedule ON seo_alert_schedule;
CREATE POLICY deny_all_seo_alert_schedule
    ON seo_alert_schedule
    FOR ALL
    USING (false);

-- ── seo_usage_counters (NEW durable usage counter table) ────────────────────
-- One row per (tenant_id, counter_key, period). period = UTC day (YYYY-MM-DD).
-- data fields: { counter_key, period, count, idempotency_keys[] }
CREATE TABLE IF NOT EXISTS seo_usage_counters (
    id         text primary key,
    tenant_id  text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    data       jsonb not null default '{}'::jsonb
);

-- Unique index on (tenant_id, data->>'counter_key') to enforce one row per
-- tenant+key+period combination (the id already encodes period, but this helps
-- PostgREST filter efficiently).
CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_usage_counters_unique_key
    ON seo_usage_counters (tenant_id, (data->>'counter_key'), (data->>'period'));

CREATE INDEX IF NOT EXISTS idx_seo_usage_counters_period
    ON seo_usage_counters ((data->>'period'));

CREATE INDEX IF NOT EXISTS idx_seo_usage_counters_counter_key
    ON seo_usage_counters ((data->>'counter_key'));

-- RLS: deny all public access; service-role bypasses RLS automatically.
ALTER TABLE seo_usage_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_seo_usage_counters ON seo_usage_counters;
CREATE POLICY deny_all_seo_usage_counters
    ON seo_usage_counters
    FOR ALL
    USING (false);

-- ── seo_scheduler_leader (heartbeat table for multi-instance observability) ──
-- One row per scheduler instance_id. Not used for correctness — just diagnostics.
CREATE TABLE IF NOT EXISTS seo_scheduler_leader (
    id         text primary key,
    tenant_id  text not null default 'system',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    data       jsonb not null default '{}'::jsonb
    -- data fields: { instance_id, heartbeat_at, expires_at, interval_s }
);

CREATE INDEX IF NOT EXISTS idx_seo_scheduler_leader_expires_at
    ON seo_scheduler_leader ((data->>'expires_at'));

-- RLS: deny all public access; service-role bypasses RLS automatically.
ALTER TABLE seo_scheduler_leader ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_seo_scheduler_leader ON seo_scheduler_leader;
CREATE POLICY deny_all_seo_scheduler_leader
    ON seo_scheduler_leader
    FOR ALL
    USING (false);

-- ── Coverage comment ─────────────────────────────────────────────────────────
-- Tables with expression indexes after this migration:
--   seo_rank_jobs             ✓ status, next_run, lock_expires_at, priority, provider
--   seo_gsc_sync_jobs         ✓ status, queued_at, lock_expires_at
--   seo_analytics_sync_jobs   ✓ status, queued_at, lock_expires_at
--   seo_crawl_jobs            ✓ status, lock_expires_at
--   seo_fix_verification      ✓ result, status
--   seo_outreach_followups    ✓ status, scheduled_for
--   seo_backlink_projects     ✓ status, next_run, provider
--   seo_gbp_sync_jobs         ✓ status, next_run
--   seo_citation_jobs         ✓ status, next_run
--   seo_link_placements       ✓ status, next_check_at
--   seo_report_schedules      ✓ status, next_run
--   seo_alert_schedule        ✓ status, next_run (NEW)
--   seo_usage_counters        ✓ unique (tenant+key+period), period, counter_key (NEW)
--   seo_scheduler_leader      ✓ expires_at (NEW)
