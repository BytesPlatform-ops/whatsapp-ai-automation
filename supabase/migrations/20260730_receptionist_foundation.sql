-- ============================================================================
-- AI Receptionist — foundation tables (config, compliance, usage, worker, infra)
-- ============================================================================
-- Companion to 20260709_ai_receptionist.sql. Covers the durable tables added in
-- the foundation wave that were not in the original file: versioned configuration,
-- consent/suppression/DNC, durable usage counters, worker jobs/attempts, message
-- idempotency, per-conversation locks, action executions, and the campaign store.
--
-- Same envelope shape as the rest of the receptionist schema:
--     { id text PK, tenant_id text, created_at, updated_at, data jsonb }
-- PostgREST upsert resolves on the PRIMARY KEY (id). Queryable fields live in
-- `data` and are read via data->>'field'; the expression indexes below keep the
-- hot lookups (idempotency, lock expiry, usage period, suppression) fast.
--
-- Apply ONCE in Supabase → SQL Editor. Idempotent (IF NOT EXISTS / ENABLE RLS).
-- Activate with PIXIE_PERSIST=supabase (+ SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
--
-- SECURITY: RLS enabled with NO anon/authenticated policy → deny-all. Access is
-- backend service-role only (bypasses RLS); the browser never queries these.
-- ============================================================================

-- ── Tables (envelope shape) ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "receptionist_message_index" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_locks" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,   -- id == tenant::conversation
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_action_executions" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_configurations" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,   -- id == tenant_id (active config)
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_config_versions" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_consent" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_suppression" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_dnc" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_usage_counters" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,   -- id == ctr::metric::period | idem::...
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_campaign_optouts" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_campaigns" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_campaign_targets" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_send_log" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_worker_jobs" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_worker_attempts" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

-- ── Indexes ─────────────────────────────────────────────────────────────────

-- backfill: the legacy business_profile table (id == tenant_id) had only a PK
CREATE INDEX IF NOT EXISTS "idx_rcp_bizprofile_tenant" ON "receptionist_business_profile" ("tenant_id");

-- idempotency: dedup key + stored action idempotency key
CREATE INDEX IF NOT EXISTS "idx_rcp_msgidx_tenant" ON "receptionist_message_index" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_msgidx_dedup"  ON "receptionist_message_index" ((data->>'dedup_key'));

-- locks: expiry + conversation for stale-lock recovery
CREATE INDEX IF NOT EXISTS "idx_rcp_locks_tenant"  ON "receptionist_locks" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_locks_expiry"  ON "receptionist_locks" ((data->>'expires_at'));
CREATE INDEX IF NOT EXISTS "idx_rcp_locks_conv"    ON "receptionist_locks" ((data->>'conversation_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_axe_tenant"  ON "receptionist_action_executions" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_axe_idem"    ON "receptionist_action_executions" ((data->>'idempotency_key'));
CREATE INDEX IF NOT EXISTS "idx_rcp_axe_type"    ON "receptionist_action_executions" ((data->>'action_type'));

-- configuration: active version lookup
CREATE INDEX IF NOT EXISTS "idx_rcp_cfg_tenant"      ON "receptionist_configurations" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_cfgver_tenant"   ON "receptionist_config_versions" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_cfgver_status"   ON "receptionist_config_versions" ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_rcp_cfgver_version"  ON "receptionist_config_versions" ((data->>'version'));

-- consent / suppression / DNC lookups (normalised email/phone + channel)
CREATE INDEX IF NOT EXISTS "idx_rcp_consent_tenant"  ON "receptionist_consent" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_consent_email"   ON "receptionist_consent" ((lower(data->>'email')));
CREATE INDEX IF NOT EXISTS "idx_rcp_consent_phone"   ON "receptionist_consent" ((data->>'phone'));
CREATE INDEX IF NOT EXISTS "idx_rcp_consent_channel" ON "receptionist_consent" ((data->>'channel'));

CREATE INDEX IF NOT EXISTS "idx_rcp_suppr_tenant"    ON "receptionist_suppression" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_suppr_email"     ON "receptionist_suppression" ((lower(data->>'email')));
CREATE INDEX IF NOT EXISTS "idx_rcp_suppr_phone"     ON "receptionist_suppression" ((data->>'phone'));
CREATE INDEX IF NOT EXISTS "idx_rcp_suppr_reason"    ON "receptionist_suppression" ((data->>'reason'));

CREATE INDEX IF NOT EXISTS "idx_rcp_dnc_tenant"      ON "receptionist_dnc" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_dnc_email"       ON "receptionist_dnc" ((lower(data->>'email')));
CREATE INDEX IF NOT EXISTS "idx_rcp_dnc_phone"       ON "receptionist_dnc" ((data->>'phone'));

-- usage counters: period + metric + idempotency marker
CREATE INDEX IF NOT EXISTS "idx_rcp_usage_tenant"  ON "receptionist_usage_counters" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_usage_metric"  ON "receptionist_usage_counters" ((data->>'metric'));
CREATE INDEX IF NOT EXISTS "idx_rcp_usage_period"  ON "receptionist_usage_counters" ((data->>'period_start'));

-- campaign store
CREATE INDEX IF NOT EXISTS "idx_rcp_coptouts_tenant" ON "receptionist_campaign_optouts" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_coptouts_email"  ON "receptionist_campaign_optouts" ((lower(data->>'email')));
CREATE INDEX IF NOT EXISTS "idx_rcp_coptouts_phone"  ON "receptionist_campaign_optouts" ((data->>'phone'));

CREATE INDEX IF NOT EXISTS "idx_rcp_campaigns_tenant"  ON "receptionist_campaigns" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_campaigns_status"  ON "receptionist_campaigns" ((data->>'status'));

CREATE INDEX IF NOT EXISTS "idx_rcp_ctargets_tenant"   ON "receptionist_campaign_targets" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_ctargets_campaign" ON "receptionist_campaign_targets" ((data->>'campaign_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_sendlog_tenant" ON "receptionist_send_log" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_sendlog_idem"   ON "receptionist_send_log" ((data->>'idempotency_key'));
CREATE INDEX IF NOT EXISTS "idx_rcp_sendlog_contact" ON "receptionist_send_log" ((data->>'contact'));

-- worker: status + due time for the atomic claim query, provider event id
CREATE INDEX IF NOT EXISTS "idx_rcp_wjobs_tenant" ON "receptionist_worker_jobs" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_wjobs_status" ON "receptionist_worker_jobs" ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_rcp_wjobs_due"    ON "receptionist_worker_jobs" ((data->>'run_at'));
CREATE INDEX IF NOT EXISTS "idx_rcp_wjobs_lock"   ON "receptionist_worker_jobs" ((data->>'lock_expires_at'));
CREATE INDEX IF NOT EXISTS "idx_rcp_wattempts_tenant" ON "receptionist_worker_attempts" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_wattempts_job"    ON "receptionist_worker_attempts" ((data->>'job_id'));

-- ── Row Level Security (enable; deny-all for anon/authenticated) ─────────────

ALTER TABLE "receptionist_message_index"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_locks"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_action_executions"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_configurations"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_config_versions"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_consent"            ENABLE ROW LEVEL SECURITY;  -- compliance
ALTER TABLE "receptionist_suppression"        ENABLE ROW LEVEL SECURITY;  -- compliance
ALTER TABLE "receptionist_dnc"                ENABLE ROW LEVEL SECURITY;  -- compliance
ALTER TABLE "receptionist_usage_counters"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_campaign_optouts"   ENABLE ROW LEVEL SECURITY;  -- compliance
ALTER TABLE "receptionist_campaigns"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_campaign_targets"   ENABLE ROW LEVEL SECURITY;  -- PII
ALTER TABLE "receptionist_send_log"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_worker_jobs"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_worker_attempts"    ENABLE ROW LEVEL SECURITY;
