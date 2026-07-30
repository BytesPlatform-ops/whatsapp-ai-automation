-- ============================================================================
-- AI Receptionist — Meta Messaging (Instagram + Messenger) tables (Wave 13)
-- ============================================================================
-- Companion to the prior receptionist migrations. Adds durable state for the
-- shared Meta messaging domain: selected assets (IG account / FB Page), provider
-- identity mapping, channel conversation mapping, drafts, send attempts,
-- delivery/read statuses, media records and provider-policy window state.
-- Instagram + Messenger share these tables; a `channel` field discriminates.
--
-- Envelope shape: { id text PK, tenant_id text, created_at, updated_at, data jsonb }.
-- Idempotent (IF NOT EXISTS / ENABLE RLS). RLS deny-all for anon/authenticated —
-- backend service-role access only. Apply ONCE; NOT to production without approval.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "receptionist_meta_assets" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_meta_identity_map" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_meta_thread_map" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_meta_drafts" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_meta_send_attempts" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_meta_statuses" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_meta_media" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_meta_windows" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "idx_rcp_metaasset_tenant"  ON "receptionist_meta_assets" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_metaasset_channel" ON "receptionist_meta_assets" ((data->>'channel'));
CREATE INDEX IF NOT EXISTS "idx_rcp_metaasset_ig"      ON "receptionist_meta_assets" ((data->>'asset_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_metaid_tenant"     ON "receptionist_meta_identity_map" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_metaid_channel"    ON "receptionist_meta_identity_map" ((data->>'channel'));
CREATE INDEX IF NOT EXISTS "idx_rcp_metaid_sender"     ON "receptionist_meta_identity_map" ((data->>'sender_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_metaid_contact"    ON "receptionist_meta_identity_map" ((data->>'contact_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_metathread_tenant" ON "receptionist_meta_thread_map" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_metathread_chan"   ON "receptionist_meta_thread_map" ((data->>'channel'));
CREATE INDEX IF NOT EXISTS "idx_rcp_metathread_sender" ON "receptionist_meta_thread_map" ((data->>'sender_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_metathread_conv"   ON "receptionist_meta_thread_map" ((data->>'conversation_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_metadraft_tenant"  ON "receptionist_meta_drafts" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_metadraft_chan"    ON "receptionist_meta_drafts" ((data->>'channel'));
CREATE INDEX IF NOT EXISTS "idx_rcp_metadraft_status"  ON "receptionist_meta_drafts" ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_rcp_metadraft_provmsg" ON "receptionist_meta_drafts" ((data->>'provider_message_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_metasend_tenant"   ON "receptionist_meta_send_attempts" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_metasend_status"   ON "receptionist_meta_send_attempts" ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_rcp_metasend_idem"     ON "receptionist_meta_send_attempts" ((data->>'idempotency_key'));

CREATE INDEX IF NOT EXISTS "idx_rcp_metastat_tenant"   ON "receptionist_meta_statuses" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_metastat_provmsg"  ON "receptionist_meta_statuses" ((data->>'provider_message_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_metastat_status"   ON "receptionist_meta_statuses" ((data->>'status'));

CREATE INDEX IF NOT EXISTS "idx_rcp_metamedia_tenant"  ON "receptionist_meta_media" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_metamedia_mid"     ON "receptionist_meta_media" ((data->>'media_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_metamedia_status"  ON "receptionist_meta_media" ((data->>'status'));

CREATE INDEX IF NOT EXISTS "idx_rcp_metawin_tenant"    ON "receptionist_meta_windows" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_metawin_sender"    ON "receptionist_meta_windows" ((data->>'sender_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_metawin_opened"    ON "receptionist_meta_windows" ((data->>'last_inbound_at'));

-- Unique provider identifiers / idempotency (envelope PKs already enforce the
-- composite keys the app builds: identity/thread/window ids embed channel+asset+sender;
-- draft provider_message_id uniqueness is enforced by the send idempotency key).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_rcp_metathread_id" ON "receptionist_meta_thread_map" ("id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_rcp_metaid_id"     ON "receptionist_meta_identity_map" ("id");

-- ── RLS (deny-all for anon/authenticated) ───────────────────────────────────

ALTER TABLE "receptionist_meta_assets"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_meta_identity_map"  ENABLE ROW LEVEL SECURITY;  -- customer identities
ALTER TABLE "receptionist_meta_thread_map"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_meta_drafts"        ENABLE ROW LEVEL SECURITY;  -- PII (message bodies)
ALTER TABLE "receptionist_meta_send_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_meta_statuses"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_meta_media"         ENABLE ROW LEVEL SECURITY;  -- customer media refs
ALTER TABLE "receptionist_meta_windows"       ENABLE ROW LEVEL SECURITY;
