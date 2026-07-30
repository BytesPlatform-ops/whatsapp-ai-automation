-- ============================================================================
-- AI Receptionist — Voice / telephony tables (Wave 16, Vapi-initial)
-- ============================================================================
-- Companion to the prior receptionist migrations. Adds durable state for the Voice
-- channel: provider phone numbers, assistant configs, call sessions, provider
-- events, transcript segments, tool-call records, transfer records, recording
-- records, end-of-call reports/summaries and scheduled callbacks.
--
-- Envelope shape: { id text PK, tenant_id text, created_at, updated_at, data jsonb }.
-- Idempotent (IF NOT EXISTS / ENABLE RLS). RLS deny-all for anon/authenticated —
-- backend service-role access only (recordings + transcripts are sensitive). Apply
-- ONCE; NOT to production without approval.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "receptionist_voice_numbers" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_voice_assistants" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_voice_sessions" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_voice_events" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_voice_transcripts" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_voice_toolcalls" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_voice_transfers" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_voice_recordings" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_voice_reports" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_voice_callbacks" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "idx_rcp_vnum_tenant"    ON "receptionist_voice_numbers" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_vnum_pnid"      ON "receptionist_voice_numbers" ((data->>'phone_number_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_vnum_number"    ON "receptionist_voice_numbers" ((data->>'number'));

CREATE INDEX IF NOT EXISTS "idx_rcp_vasst_tenant"   ON "receptionist_voice_assistants" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_vasst_aid"      ON "receptionist_voice_assistants" ((data->>'assistant_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_vsess_tenant"   ON "receptionist_voice_sessions" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_vsess_call"     ON "receptionist_voice_sessions" ((data->>'call_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_vsess_caller"   ON "receptionist_voice_sessions" ((data->>'caller_number'));
CREATE INDEX IF NOT EXISTS "idx_rcp_vsess_recip"    ON "receptionist_voice_sessions" ((data->>'recipient_number'));
CREATE INDEX IF NOT EXISTS "idx_rcp_vsess_contact"  ON "receptionist_voice_sessions" ((data->>'contact_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_vsess_conv"     ON "receptionist_voice_sessions" ((data->>'conversation_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_vsess_status"   ON "receptionist_voice_sessions" ((data->>'status'));

CREATE INDEX IF NOT EXISTS "idx_rcp_vevt_tenant"    ON "receptionist_voice_events" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_vevt_call"      ON "receptionist_voice_events" ((data->>'call_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_vevt_type"      ON "receptionist_voice_events" ((data->>'event_type'));

CREATE INDEX IF NOT EXISTS "idx_rcp_vts_tenant"     ON "receptionist_voice_transcripts" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_vts_call"       ON "receptionist_voice_transcripts" ((data->>'call_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_vts_seq"        ON "receptionist_voice_transcripts" ((data->>'sequence'));

CREATE INDEX IF NOT EXISTS "idx_rcp_vtc_tenant"     ON "receptionist_voice_toolcalls" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_vtc_call"       ON "receptionist_voice_toolcalls" ((data->>'call_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_vtc_toolid"     ON "receptionist_voice_toolcalls" ((data->>'tool_call_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_vxfer_tenant"   ON "receptionist_voice_transfers" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_vxfer_call"     ON "receptionist_voice_transfers" ((data->>'call_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_vxfer_outcome"  ON "receptionist_voice_transfers" ((data->>'outcome'));

CREATE INDEX IF NOT EXISTS "idx_rcp_vrec_tenant"    ON "receptionist_voice_recordings" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_vrec_call"      ON "receptionist_voice_recordings" ((data->>'call_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_vrep_tenant"    ON "receptionist_voice_reports" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_vrep_call"      ON "receptionist_voice_reports" ((data->>'call_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_vrep_reason"    ON "receptionist_voice_reports" ((data->>'ended_reason'));

CREATE INDEX IF NOT EXISTS "idx_rcp_vcb_tenant"     ON "receptionist_voice_callbacks" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_vcb_status"     ON "receptionist_voice_callbacks" ((data->>'status'));

-- Unique provider call ids + event/tool-call idempotency (session + toolcall +
-- report ids embed the call id; transcript ids embed call + sequence).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_rcp_vsess_id"  ON "receptionist_voice_sessions" ("id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_rcp_vtc_id"    ON "receptionist_voice_toolcalls" ("id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_rcp_vts_id"    ON "receptionist_voice_transcripts" ("id");

-- ── RLS (deny-all for anon/authenticated) ───────────────────────────────────

ALTER TABLE "receptionist_voice_numbers"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_voice_assistants"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_voice_sessions"    ENABLE ROW LEVEL SECURITY;  -- caller PII
ALTER TABLE "receptionist_voice_events"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_voice_transcripts" ENABLE ROW LEVEL SECURITY;  -- transcript content
ALTER TABLE "receptionist_voice_toolcalls"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_voice_transfers"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_voice_recordings"  ENABLE ROW LEVEL SECURITY;  -- recording access controls
ALTER TABLE "receptionist_voice_reports"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_voice_callbacks"   ENABLE ROW LEVEL SECURITY;
