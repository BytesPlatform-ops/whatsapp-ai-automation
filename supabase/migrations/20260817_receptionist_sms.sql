-- ============================================================================
-- AI Receptionist — SMS channel tables (Wave 14)
-- ============================================================================
-- Companion to the prior receptionist migrations. Adds durable state for the SMS
-- channel (Twilio-initial, replaceable provider): sender-number mapping, thread
-- mapping, drafts, send attempts, delivery statuses, MMS media records and the
-- quiet-hours delayed-send queue.
--
-- Envelope shape: { id text PK, tenant_id text, created_at, updated_at, data jsonb }.
-- Idempotent (IF NOT EXISTS / ENABLE RLS). RLS deny-all for anon/authenticated —
-- backend service-role access only. Apply ONCE; NOT to production without approval.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "receptionist_sms_number_map" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_sms_thread_map" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_sms_drafts" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_sms_send_attempts" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_sms_statuses" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_sms_media" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_sms_delayed" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "idx_rcp_smsnum_tenant"   ON "receptionist_sms_number_map" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_smsnum_sender"   ON "receptionist_sms_number_map" ((data->>'sender_number'));

CREATE INDEX IF NOT EXISTS "idx_rcp_smsthread_tenant" ON "receptionist_sms_thread_map" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_smsthread_sender" ON "receptionist_sms_thread_map" ((data->>'sender_number'));
CREATE INDEX IF NOT EXISTS "idx_rcp_smsthread_cust"   ON "receptionist_sms_thread_map" ((data->>'customer_number'));
CREATE INDEX IF NOT EXISTS "idx_rcp_smsthread_conv"   ON "receptionist_sms_thread_map" ((data->>'conversation_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_smsdraft_tenant"  ON "receptionist_sms_drafts" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_smsdraft_status"  ON "receptionist_sms_drafts" ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_rcp_smsdraft_provmsg" ON "receptionist_sms_drafts" ((data->>'provider_message_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_smsdraft_cust"    ON "receptionist_sms_drafts" ((data->>'customer_number'));

CREATE INDEX IF NOT EXISTS "idx_rcp_smssend_tenant"   ON "receptionist_sms_send_attempts" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_smssend_status"   ON "receptionist_sms_send_attempts" ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_rcp_smssend_idem"     ON "receptionist_sms_send_attempts" ((data->>'idempotency_key'));

CREATE INDEX IF NOT EXISTS "idx_rcp_smsstat_tenant"   ON "receptionist_sms_statuses" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_smsstat_provmsg"  ON "receptionist_sms_statuses" ((data->>'provider_message_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_smsstat_status"   ON "receptionist_sms_statuses" ((data->>'status'));

CREATE INDEX IF NOT EXISTS "idx_rcp_smsmedia_tenant"  ON "receptionist_sms_media" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_smsmedia_status"  ON "receptionist_sms_media" ((data->>'status'));

CREATE INDEX IF NOT EXISTS "idx_rcp_smsdelayed_tenant" ON "receptionist_sms_delayed" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_smsdelayed_when"   ON "receptionist_sms_delayed" ((data->>'delayed_until'));
CREATE INDEX IF NOT EXISTS "idx_rcp_smsdelayed_status" ON "receptionist_sms_delayed" ((data->>'status'));

-- Unique provider identifiers / idempotency (number map is one row per tenant;
-- thread ids embed sender+customer; send idempotency enforced by the draft key).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_rcp_smsthread_id" ON "receptionist_sms_thread_map" ("id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_rcp_smsnum_id"    ON "receptionist_sms_number_map" ("id");

-- ── RLS (deny-all for anon/authenticated) ───────────────────────────────────

ALTER TABLE "receptionist_sms_number_map"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_sms_thread_map"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_sms_drafts"       ENABLE ROW LEVEL SECURITY;  -- PII (message bodies)
ALTER TABLE "receptionist_sms_send_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_sms_statuses"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_sms_media"        ENABLE ROW LEVEL SECURITY;  -- customer media refs
ALTER TABLE "receptionist_sms_delayed"      ENABLE ROW LEVEL SECURITY;
