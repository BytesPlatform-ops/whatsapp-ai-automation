-- ============================================================================
-- AI Receptionist — External CRM marketplace + bidirectional sync (Wave 18)
-- ============================================================================
-- Durable state for the replaceable CRM marketplace (GoHighLevel, HubSpot,
-- Salesforce, Pipedrive, Zoho): provider connections, discovered capabilities,
-- enabled objects, external↔canonical record mappings, field + pipeline mappings,
-- sync checkpoints, per-record sync results, webhook events, conflicts, outbound
-- write attempts and the CRM audit trail.
--
-- Envelope shape: { id text PK, tenant_id text, created_at, updated_at, data jsonb }.
-- Idempotent (IF NOT EXISTS / ENABLE RLS). RLS deny-all for anon/authenticated —
-- backend service-role access only (connections hold sealed provider credentials).
-- Apply ONCE; NOT to production without approval.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "receptionist_crm_connections" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_crm_capabilities" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_crm_objects" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_crm_mappings" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_crm_field_mappings" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_crm_pipeline_mappings" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_crm_checkpoints" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_crm_sync_results" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_crm_webhook_events" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_crm_conflicts" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_crm_outbound" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_crm_audit" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "idx_rcp_crmconn_tenant"  ON "receptionist_crm_connections" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_crmconn_prov"    ON "receptionist_crm_connections" ((data->>'provider'));
CREATE INDEX IF NOT EXISTS "idx_rcp_crmconn_acct"    ON "receptionist_crm_connections" ((data->>'account_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_crmcap_tenant"   ON "receptionist_crm_capabilities" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_crmcap_prov"     ON "receptionist_crm_capabilities" ((data->>'provider'));

CREATE INDEX IF NOT EXISTS "idx_rcp_crmobj_tenant"   ON "receptionist_crm_objects" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_crmobj_ext"      ON "receptionist_crm_objects" ((data->>'external_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_crmmap_tenant"   ON "receptionist_crm_mappings" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_crmmap_prov"     ON "receptionist_crm_mappings" ((data->>'provider'));
CREATE INDEX IF NOT EXISTS "idx_rcp_crmmap_obj"      ON "receptionist_crm_mappings" ((data->>'object_type'));
CREATE INDEX IF NOT EXISTS "idx_rcp_crmmap_recid"    ON "receptionist_crm_mappings" ((data->>'record_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_crmmap_canon"    ON "receptionist_crm_mappings" ((data->>'canonical_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_crmmap_status"   ON "receptionist_crm_mappings" ((data->>'sync_status'));

CREATE INDEX IF NOT EXISTS "idx_rcp_crmfm_tenant"    ON "receptionist_crm_field_mappings" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_crmfm_prov"      ON "receptionist_crm_field_mappings" ((data->>'provider'));

CREATE INDEX IF NOT EXISTS "idx_rcp_crmpm_tenant"    ON "receptionist_crm_pipeline_mappings" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_crmpm_prov"      ON "receptionist_crm_pipeline_mappings" ((data->>'provider'));

CREATE INDEX IF NOT EXISTS "idx_rcp_crmck_tenant"    ON "receptionist_crm_checkpoints" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_crmck_prov"      ON "receptionist_crm_checkpoints" ((data->>'provider'));
CREATE INDEX IF NOT EXISTS "idx_rcp_crmck_cursor"    ON "receptionist_crm_checkpoints" ((data->>'cursor'));

CREATE INDEX IF NOT EXISTS "idx_rcp_crmres_tenant"   ON "receptionist_crm_sync_results" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_crmres_outcome"  ON "receptionist_crm_sync_results" ((data->>'outcome'));

CREATE INDEX IF NOT EXISTS "idx_rcp_crmwh_tenant"    ON "receptionist_crm_webhook_events" ("tenant_id");

CREATE INDEX IF NOT EXISTS "idx_rcp_crmcf_tenant"    ON "receptionist_crm_conflicts" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_crmcf_state"     ON "receptionist_crm_conflicts" ((data->>'state'));
CREATE INDEX IF NOT EXISTS "idx_rcp_crmcf_prov"      ON "receptionist_crm_conflicts" ((data->>'provider'));

CREATE INDEX IF NOT EXISTS "idx_rcp_crmout_tenant"   ON "receptionist_crm_outbound" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_crmout_state"    ON "receptionist_crm_outbound" ((data->>'state'));
CREATE INDEX IF NOT EXISTS "idx_rcp_crmout_ext"      ON "receptionist_crm_outbound" ((data->>'external_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_crmaud_tenant"   ON "receptionist_crm_audit" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_crmaud_prov"     ON "receptionist_crm_audit" ((data->>'provider'));

-- Unique provider-record mapping + outbound idempotency (mapping/outbound ids embed
-- (provider, object_type, record_id) / (provider, canonical_id, trigger)).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_rcp_crmmap_id"  ON "receptionist_crm_mappings" ("id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_rcp_crmout_id"  ON "receptionist_crm_outbound" ("id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_rcp_crmck_id"   ON "receptionist_crm_checkpoints" ("id");

-- ── RLS (deny-all for anon/authenticated) ───────────────────────────────────

ALTER TABLE "receptionist_crm_connections"       ENABLE ROW LEVEL SECURITY;  -- sealed credentials
ALTER TABLE "receptionist_crm_capabilities"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_crm_objects"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_crm_mappings"          ENABLE ROW LEVEL SECURITY;  -- contact linkage
ALTER TABLE "receptionist_crm_field_mappings"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_crm_pipeline_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_crm_checkpoints"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_crm_sync_results"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_crm_webhook_events"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_crm_conflicts"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_crm_outbound"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_crm_audit"             ENABLE ROW LEVEL SECURITY;
