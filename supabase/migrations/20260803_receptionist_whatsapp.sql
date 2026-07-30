-- ============================================================================
-- AI Receptionist — WhatsApp Cloud API tables (Wave 12)
-- ============================================================================
-- Companion to the prior receptionist migrations. Adds durable state for the
-- WhatsApp channel: phone-number/thread mapping, drafts, send attempts, delivery
-- statuses, templates, media records and messaging-window policy state.
--
-- Envelope shape: { id text PK, tenant_id text, created_at, updated_at, data jsonb }.
-- Idempotent (IF NOT EXISTS / ENABLE RLS). RLS deny-all for anon/authenticated —
-- backend service-role access only. Apply ONCE; NOT to production without approval.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "receptionist_whatsapp_phone_map" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_whatsapp_thread_map" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_whatsapp_drafts" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_whatsapp_send_attempts" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_whatsapp_templates" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_whatsapp_media" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_whatsapp_windows" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "idx_rcp_waphone_tenant" ON "receptionist_whatsapp_phone_map" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_waphone_pid"    ON "receptionist_whatsapp_phone_map" ((data->>'phone_number_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_waphone_waba"   ON "receptionist_whatsapp_phone_map" ((data->>'waba_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_wathread_tenant" ON "receptionist_whatsapp_thread_map" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_wathread_waid"   ON "receptionist_whatsapp_thread_map" ((data->>'wa_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_wathread_conv"   ON "receptionist_whatsapp_thread_map" ((data->>'conversation_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_wadraft_tenant"  ON "receptionist_whatsapp_drafts" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_wadraft_status"  ON "receptionist_whatsapp_drafts" ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_rcp_wadraft_provmsg" ON "receptionist_whatsapp_drafts" ((data->>'provider_message_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_wadraft_waid"    ON "receptionist_whatsapp_drafts" ((data->>'wa_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_wasend_tenant"   ON "receptionist_whatsapp_send_attempts" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_wasend_status"   ON "receptionist_whatsapp_send_attempts" ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_rcp_wasend_idem"     ON "receptionist_whatsapp_send_attempts" ((data->>'idempotency_key'));

CREATE INDEX IF NOT EXISTS "idx_rcp_watpl_tenant"    ON "receptionist_whatsapp_templates" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_watpl_name"      ON "receptionist_whatsapp_templates" ((data->>'name'));
CREATE INDEX IF NOT EXISTS "idx_rcp_watpl_status"    ON "receptionist_whatsapp_templates" ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_rcp_watpl_lang"      ON "receptionist_whatsapp_templates" ((data->>'language'));

CREATE INDEX IF NOT EXISTS "idx_rcp_wamedia_tenant"  ON "receptionist_whatsapp_media" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_wamedia_mid"     ON "receptionist_whatsapp_media" ((data->>'media_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_wamedia_status"  ON "receptionist_whatsapp_media" ((data->>'status'));

CREATE INDEX IF NOT EXISTS "idx_rcp_wawin_tenant"    ON "receptionist_whatsapp_windows" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_wawin_waid"      ON "receptionist_whatsapp_windows" ((data->>'wa_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_wawin_opened"    ON "receptionist_whatsapp_windows" ((data->>'last_inbound_at'));

-- ── RLS (deny-all for anon/authenticated) ───────────────────────────────────

ALTER TABLE "receptionist_whatsapp_phone_map"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_whatsapp_thread_map"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_whatsapp_drafts"        ENABLE ROW LEVEL SECURITY;  -- PII (message bodies)
ALTER TABLE "receptionist_whatsapp_send_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_whatsapp_templates"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_whatsapp_media"         ENABLE ROW LEVEL SECURITY;  -- customer media refs
ALTER TABLE "receptionist_whatsapp_windows"       ENABLE ROW LEVEL SECURITY;
