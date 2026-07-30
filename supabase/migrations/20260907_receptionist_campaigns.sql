-- ============================================================================
-- AI Receptionist — Advanced outbound campaigns (Wave 17)
-- ============================================================================
-- Orchestration layer over the existing channels. Adds durable state for campaigns,
-- versions, steps, channel-typed content, approvals, saved segments, audience
-- snapshots, recipients, step executions, frequency caps, reply/conversion
-- attribution and the campaign audit trail.
--
-- Envelope shape: { id text PK, tenant_id text, created_at, updated_at, data jsonb }.
-- Idempotent (IF NOT EXISTS / ENABLE RLS). RLS deny-all for anon/authenticated —
-- backend service-role access only. Apply ONCE; NOT to production without approval.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "receptionist_campaigns_v2" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_campaign_versions" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_campaign_steps" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_campaign_content" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_campaign_approvals" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_campaign_segments" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_campaign_snapshots" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_campaign_recipients" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_campaign_executions" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_campaign_freqcaps" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_campaign_attribution" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_campaign_audit" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "idx_rcp_cmp_tenant"     ON "receptionist_campaigns_v2" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_cmp_status"     ON "receptionist_campaigns_v2" ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_rcp_cmp_purpose"    ON "receptionist_campaigns_v2" ((data->>'purpose'));

CREATE INDEX IF NOT EXISTS "idx_rcp_cmpver_tenant"  ON "receptionist_campaign_versions" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_cmpver_cmp"     ON "receptionist_campaign_versions" ((data->>'campaign_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_cmpstep_tenant" ON "receptionist_campaign_steps" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_cmpstep_cmp"    ON "receptionist_campaign_steps" ((data->>'campaign_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_cmpstep_chan"   ON "receptionist_campaign_steps" ((data->>'channel'));

CREATE INDEX IF NOT EXISTS "idx_rcp_cmpcnt_tenant"  ON "receptionist_campaign_content" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_cmpcnt_cmp"     ON "receptionist_campaign_content" ((data->>'campaign_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_cmpcnt_chan"    ON "receptionist_campaign_content" ((data->>'channel'));

CREATE INDEX IF NOT EXISTS "idx_rcp_cmpapr_tenant"  ON "receptionist_campaign_approvals" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_cmpapr_cmp"     ON "receptionist_campaign_approvals" ((data->>'campaign_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_cmpseg_tenant"  ON "receptionist_campaign_segments" ("tenant_id");

CREATE INDEX IF NOT EXISTS "idx_rcp_cmpsnap_tenant" ON "receptionist_campaign_snapshots" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_cmpsnap_cmp"    ON "receptionist_campaign_snapshots" ((data->>'campaign_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_cmprcpt_tenant" ON "receptionist_campaign_recipients" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_cmprcpt_cmp"    ON "receptionist_campaign_recipients" ((data->>'campaign_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_cmprcpt_contact" ON "receptionist_campaign_recipients" ((data->>'contact_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_cmprcpt_state"  ON "receptionist_campaign_recipients" ((data->>'state'));

CREATE INDEX IF NOT EXISTS "idx_rcp_cmpexec_tenant" ON "receptionist_campaign_executions" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_cmpexec_cmp"    ON "receptionist_campaign_executions" ((data->>'campaign_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_cmpexec_state"  ON "receptionist_campaign_executions" ((data->>'state'));
CREATE INDEX IF NOT EXISTS "idx_rcp_cmpexec_prov"   ON "receptionist_campaign_executions" ((data->>'provider_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_cmpcap_tenant"  ON "receptionist_campaign_freqcaps" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_cmpcap_contact" ON "receptionist_campaign_freqcaps" ((data->>'contact_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_cmpattr_tenant" ON "receptionist_campaign_attribution" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_cmpattr_cmp"    ON "receptionist_campaign_attribution" ((data->>'campaign_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_cmpaud_tenant"  ON "receptionist_campaign_audit" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_cmpaud_cmp"     ON "receptionist_campaign_audit" ((data->>'campaign_id'));

-- Unique idempotency: one execution per (campaign, step, contact); recipient ids
-- embed (campaign, contact); freqcap ids embed (contact, channel, period).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_rcp_cmpexec_id"  ON "receptionist_campaign_executions" ("id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_rcp_cmprcpt_id"  ON "receptionist_campaign_recipients" ("id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_rcp_cmpcap_id"   ON "receptionist_campaign_freqcaps" ("id");

-- ── RLS (deny-all for anon/authenticated) ───────────────────────────────────

ALTER TABLE "receptionist_campaigns_v2"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_campaign_versions"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_campaign_steps"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_campaign_content"       ENABLE ROW LEVEL SECURITY;  -- message bodies
ALTER TABLE "receptionist_campaign_approvals"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_campaign_segments"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_campaign_snapshots"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_campaign_recipients"    ENABLE ROW LEVEL SECURITY;  -- contact PII
ALTER TABLE "receptionist_campaign_executions"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_campaign_freqcaps"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_campaign_attribution"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_campaign_audit"         ENABLE ROW LEVEL SECURITY;
