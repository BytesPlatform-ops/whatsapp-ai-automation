-- ============================================================================
-- AI Receptionist — Gmail, Calendar and Widget tables (Wave 7)
-- ============================================================================
-- Companion to 20260709_ai_receptionist.sql and 20260730_receptionist_foundation.sql.
-- Adds durable state for live Gmail (sync/threads/drafts/send attempts), Google
-- Calendar (config/holds/provider events) and the Website Chat widget
-- (domains/sessions).
--
-- Envelope shape: { id text PK, tenant_id text, created_at, updated_at, data jsonb }.
-- Idempotent (IF NOT EXISTS / ENABLE RLS). RLS deny-all for anon/authenticated —
-- backend service-role access only. Apply ONCE; do NOT apply to production without
-- explicit approval.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "receptionist_gmail_sync_state" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,  -- id == tenant_id (one row/tenant)
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_gmail_thread_map" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_gmail_drafts" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_gmail_send_attempts" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_calendar_config" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,  -- id == tenant_id
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_booking_holds" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_provider_events" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_widget_domains" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_widget_sessions" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "idx_rcp_gsync_tenant"   ON "receptionist_gmail_sync_state" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_gsync_history"  ON "receptionist_gmail_sync_state" ((data->>'last_history_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_gthread_tenant" ON "receptionist_gmail_thread_map" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_gthread_thread" ON "receptionist_gmail_thread_map" ((data->>'thread_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_gthread_conv"   ON "receptionist_gmail_thread_map" ((data->>'conversation_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_gdraft_tenant"  ON "receptionist_gmail_drafts" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_gdraft_status"  ON "receptionist_gmail_drafts" ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_rcp_gdraft_thread"  ON "receptionist_gmail_drafts" ((data->>'thread_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_gdraft_provmsg" ON "receptionist_gmail_drafts" ((data->>'provider_message_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_gsend_tenant"   ON "receptionist_gmail_send_attempts" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_gsend_status"   ON "receptionist_gmail_send_attempts" ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_rcp_gsend_idem"     ON "receptionist_gmail_send_attempts" ((data->>'idempotency_key'));

CREATE INDEX IF NOT EXISTS "idx_rcp_calcfg_tenant"  ON "receptionist_calendar_config" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_calcfg_calid"   ON "receptionist_calendar_config" ((data->>'calendar_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_hold_tenant"    ON "receptionist_booking_holds" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_hold_status"    ON "receptionist_booking_holds" ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_rcp_hold_expiry"    ON "receptionist_booking_holds" ((data->>'expires_at'));
CREATE INDEX IF NOT EXISTS "idx_rcp_hold_slot"      ON "receptionist_booking_holds" ((data->>'start'));
CREATE INDEX IF NOT EXISTS "idx_rcp_hold_idem"      ON "receptionist_booking_holds" ((data->>'idempotency_key'));

CREATE INDEX IF NOT EXISTS "idx_rcp_pevent_tenant"  ON "receptionist_provider_events" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_pevent_evid"    ON "receptionist_provider_events" ((data->>'provider_event_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_pevent_booking" ON "receptionist_provider_events" ((data->>'booking_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_pevent_status"  ON "receptionist_provider_events" ((data->>'reconciliation_status'));

CREATE INDEX IF NOT EXISTS "idx_rcp_wdom_tenant"    ON "receptionist_widget_domains" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_wdom_public"    ON "receptionist_widget_domains" ((data->>'public_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_wsess_tenant"   ON "receptionist_widget_sessions" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_wsess_public"   ON "receptionist_widget_sessions" ((data->>'public_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_wsess_expiry"   ON "receptionist_widget_sessions" ((data->>'expires_at'));

-- ── RLS (deny-all for anon/authenticated) ───────────────────────────────────

ALTER TABLE "receptionist_gmail_sync_state"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_gmail_thread_map"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_gmail_drafts"         ENABLE ROW LEVEL SECURITY;  -- PII (email bodies)
ALTER TABLE "receptionist_gmail_send_attempts"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_calendar_config"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_booking_holds"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_provider_events"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_widget_domains"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_widget_sessions"      ENABLE ROW LEVEL SECURITY;  -- session secrets
