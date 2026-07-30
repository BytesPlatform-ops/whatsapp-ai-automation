-- ============================================================================
-- AI Receptionist — Telegram channel tables (Wave 15)
-- ============================================================================
-- Companion to the prior receptionist migrations. Adds durable state for the
-- Telegram channel (Bot + Business, one shared domain): business connections,
-- identity mapping, thread mapping, drafts, send attempts, provider statuses,
-- callback records, media records and edited/deleted (tombstone) records.
--
-- Envelope shape: { id text PK, tenant_id text, created_at, updated_at, data jsonb }.
-- Idempotent (IF NOT EXISTS / ENABLE RLS). RLS deny-all for anon/authenticated —
-- backend service-role access only. Apply ONCE; NOT to production without approval.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "receptionist_telegram_business" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_telegram_identity_map" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_telegram_thread_map" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_telegram_drafts" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_telegram_send_attempts" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_telegram_statuses" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_telegram_callbacks" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_telegram_media" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_telegram_edits" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "idx_rcp_tgbiz_tenant"    ON "receptionist_telegram_business" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_tgbiz_bcid"      ON "receptionist_telegram_business" ((data->>'business_connection_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_tgid_tenant"     ON "receptionist_telegram_identity_map" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_tgid_mode"       ON "receptionist_telegram_identity_map" ((data->>'mode'));
CREATE INDEX IF NOT EXISTS "idx_rcp_tgid_user"       ON "receptionist_telegram_identity_map" ((data->>'user_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_tgid_contact"    ON "receptionist_telegram_identity_map" ((data->>'contact_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_tgthread_tenant" ON "receptionist_telegram_thread_map" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_tgthread_mode"   ON "receptionist_telegram_thread_map" ((data->>'mode'));
CREATE INDEX IF NOT EXISTS "idx_rcp_tgthread_chat"   ON "receptionist_telegram_thread_map" ((data->>'chat_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_tgthread_conv"   ON "receptionist_telegram_thread_map" ((data->>'conversation_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_tgdraft_tenant"  ON "receptionist_telegram_drafts" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_tgdraft_mode"    ON "receptionist_telegram_drafts" ((data->>'mode'));
CREATE INDEX IF NOT EXISTS "idx_rcp_tgdraft_status"  ON "receptionist_telegram_drafts" ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_rcp_tgdraft_provmsg" ON "receptionist_telegram_drafts" ((data->>'provider_message_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_tgdraft_chat"    ON "receptionist_telegram_drafts" ((data->>'chat_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_tgsend_tenant"   ON "receptionist_telegram_send_attempts" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_tgsend_status"   ON "receptionist_telegram_send_attempts" ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_rcp_tgsend_idem"     ON "receptionist_telegram_send_attempts" ((data->>'idempotency_key'));

CREATE INDEX IF NOT EXISTS "idx_rcp_tgstat_tenant"   ON "receptionist_telegram_statuses" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_tgstat_provmsg"  ON "receptionist_telegram_statuses" ((data->>'provider_message_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_tgstat_status"   ON "receptionist_telegram_statuses" ((data->>'status'));

CREATE INDEX IF NOT EXISTS "idx_rcp_tgcb_tenant"     ON "receptionist_telegram_callbacks" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_tgcb_conv"       ON "receptionist_telegram_callbacks" ((data->>'conversation_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_tgcb_used"       ON "receptionist_telegram_callbacks" ((data->>'used'));

CREATE INDEX IF NOT EXISTS "idx_rcp_tgmedia_tenant"  ON "receptionist_telegram_media" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_tgmedia_file"    ON "receptionist_telegram_media" ((data->>'file_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_tgmedia_status"  ON "receptionist_telegram_media" ((data->>'status'));

CREATE INDEX IF NOT EXISTS "idx_rcp_tgedit_tenant"   ON "receptionist_telegram_edits" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_tgedit_msg"      ON "receptionist_telegram_edits" ((data->>'message_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_tgedit_kind"     ON "receptionist_telegram_edits" ((data->>'kind'));

-- Unique provider identifiers / idempotency (thread + identity + business ids are
-- composite envelope PKs; callback tokens are opaque unique ids).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_rcp_tgthread_id" ON "receptionist_telegram_thread_map" ("id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_rcp_tgcb_id"     ON "receptionist_telegram_callbacks" ("id");

-- ── RLS (deny-all for anon/authenticated) ───────────────────────────────────

ALTER TABLE "receptionist_telegram_business"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_telegram_identity_map"  ENABLE ROW LEVEL SECURITY;  -- customer identities
ALTER TABLE "receptionist_telegram_thread_map"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_telegram_drafts"        ENABLE ROW LEVEL SECURITY;  -- PII (message bodies)
ALTER TABLE "receptionist_telegram_send_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_telegram_statuses"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_telegram_callbacks"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_telegram_media"         ENABLE ROW LEVEL SECURITY;  -- customer media refs
ALTER TABLE "receptionist_telegram_edits"         ENABLE ROW LEVEL SECURITY;
