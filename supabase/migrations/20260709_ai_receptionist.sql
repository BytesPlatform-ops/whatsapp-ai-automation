-- ============================================================================
-- AI Receptionist — durable Supabase schema (tables + indexes + RLS)
-- ============================================================================
-- Apply ONCE in Supabase → SQL Editor → New query → Run. Safe to re-run
-- (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS / ENABLE RLS are
-- idempotent).
--
-- WHY THIS FILE EXISTS
--   The Python backend has no ORM/migration runner; it persists through the
--   shared `persistence.table()` layer, whose Supabase backend (`_SupabaseRepo`)
--   writes each record to `POST /rest/v1/<table>` as the normalized ROW envelope:
--       { id, tenant_id, created_at, updated_at, data (jsonb) }
--   PostgREST upsert uses `Prefer: resolution=merge-duplicates`, which resolves
--   on the PRIMARY KEY (`id`). So every receptionist table has that exact shape.
--   Queryable fields live inside `data` and are read via `data->>'field'`; the
--   expression indexes below keep the hot lookups fast.
--
--   Activate with:  PIXIE_PERSIST=supabase  (+ SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
--   In memory/file mode these tables are unused (local dev / tests stay hermetic).
--
-- SECURITY MODEL (identical to supabase/rls/pixie-services-rls.sql)
--   These tables are written/read ONLY by the backend using the Supabase
--   SERVICE-ROLE key, which BYPASSES RLS. The browser never queries them — all
--   product access goes through the Next.js /api/lab/* proxies, which resolve the
--   workspace tenant SERVER-SIDE. So we ENABLE RLS with NO permissive policy for
--   `anon`/`authenticated`: those roles can read/write nothing → zero
--   cross-tenant leakage even over a direct connection. `tenant_id` is a
--   free-form backend tenant string (e.g. "ws_<id>", "demo"), not a Supabase
--   auth.users id, so we intentionally do NOT add auth.uid() policies (a
--   commented per-workspace template is at the end).
-- ============================================================================

-- ── Tables (all share the envelope shape) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS "receptionist_conversations" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_messages" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_actions" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_contacts" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_companies" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_bookings" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_quotes" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_callbacks" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_voicemails" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_waitlist" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_payments" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_tickets" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_escalations" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_tasks" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_reminders" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_optouts" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_business_profile" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,   -- id == tenant_id (one row/tenant)
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_knowledge" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS "receptionist_campaign_replies" (
  "id" text PRIMARY KEY, "tenant_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb);

-- ── Indexes ─────────────────────────────────────────────────────────────────
-- Every table gets (tenant_id) + (tenant_id, created_at desc) — the two access
-- patterns the row repo uses (list_by_tenant, ordered). Hot per-table lookups
-- get expression indexes on the relevant data->>'field'.

CREATE INDEX IF NOT EXISTS "idx_rcp_conversations_tenant"  ON "receptionist_conversations"  ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_conversations_created" ON "receptionist_conversations"  ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_rcp_conversations_contact" ON "receptionist_conversations"  ((data->>'contact_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_conversations_status"  ON "receptionist_conversations"  ((data->>'status'));

CREATE INDEX IF NOT EXISTS "idx_rcp_messages_tenant"  ON "receptionist_messages"  ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_messages_created" ON "receptionist_messages"  ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_rcp_messages_conv"    ON "receptionist_messages"  ((data->>'conversation_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_actions_tenant"  ON "receptionist_actions"  ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_actions_created" ON "receptionist_actions"  ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_rcp_actions_conv"    ON "receptionist_actions"  ((data->>'conversation_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_actions_intent"  ON "receptionist_actions"  ((data->>'intent'));

CREATE INDEX IF NOT EXISTS "idx_rcp_contacts_tenant"  ON "receptionist_contacts"  ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_contacts_created" ON "receptionist_contacts"  ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_rcp_contacts_email"   ON "receptionist_contacts"  ((lower(data->>'email')));
CREATE INDEX IF NOT EXISTS "idx_rcp_contacts_phone"   ON "receptionist_contacts"  ((data->>'phone'));
CREATE INDEX IF NOT EXISTS "idx_rcp_contacts_status"  ON "receptionist_contacts"  ((data->>'status'));

CREATE INDEX IF NOT EXISTS "idx_rcp_companies_tenant" ON "receptionist_companies" ("tenant_id");

CREATE INDEX IF NOT EXISTS "idx_rcp_bookings_tenant"  ON "receptionist_bookings"  ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_bookings_created" ON "receptionist_bookings"  ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_rcp_bookings_status"  ON "receptionist_bookings"  ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_rcp_bookings_contact" ON "receptionist_bookings"  ((data->>'contact_id'));

CREATE INDEX IF NOT EXISTS "idx_rcp_quotes_tenant"  ON "receptionist_quotes"  ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_quotes_created" ON "receptionist_quotes"  ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_rcp_quotes_status"  ON "receptionist_quotes"  ((data->>'status'));

CREATE INDEX IF NOT EXISTS "idx_rcp_callbacks_tenant"  ON "receptionist_callbacks"  ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_callbacks_status"  ON "receptionist_callbacks"  ((data->>'status'));

CREATE INDEX IF NOT EXISTS "idx_rcp_voicemails_tenant" ON "receptionist_voicemails" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_voicemails_status" ON "receptionist_voicemails" ((data->>'status'));

CREATE INDEX IF NOT EXISTS "idx_rcp_waitlist_tenant" ON "receptionist_waitlist" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_waitlist_status" ON "receptionist_waitlist" ((data->>'status'));

CREATE INDEX IF NOT EXISTS "idx_rcp_payments_tenant"   ON "receptionist_payments"  ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_payments_status"   ON "receptionist_payments"  ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_rcp_payments_ref"      ON "receptionist_payments"  ((data->>'provider_ref'));

CREATE INDEX IF NOT EXISTS "idx_rcp_tickets_tenant"   ON "receptionist_tickets"  ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_tickets_status"   ON "receptionist_tickets"  ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_rcp_tickets_priority" ON "receptionist_tickets"  ((data->>'priority'));

CREATE INDEX IF NOT EXISTS "idx_rcp_escalations_tenant" ON "receptionist_escalations" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_escalations_status" ON "receptionist_escalations" ((data->>'status'));

CREATE INDEX IF NOT EXISTS "idx_rcp_tasks_tenant"  ON "receptionist_tasks"  ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_tasks_status"  ON "receptionist_tasks"  ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_rcp_tasks_due"     ON "receptionist_tasks"  ((data->>'due_at'));

CREATE INDEX IF NOT EXISTS "idx_rcp_reminders_tenant" ON "receptionist_reminders" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_reminders_at"     ON "receptionist_reminders" ((data->>'remind_at'));

CREATE INDEX IF NOT EXISTS "idx_rcp_optouts_tenant" ON "receptionist_optouts" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_optouts_email"  ON "receptionist_optouts" ((lower(data->>'email')));
CREATE INDEX IF NOT EXISTS "idx_rcp_optouts_phone"  ON "receptionist_optouts" ((data->>'phone'));

CREATE INDEX IF NOT EXISTS "idx_rcp_knowledge_tenant" ON "receptionist_knowledge" ("tenant_id");

CREATE INDEX IF NOT EXISTS "idx_rcp_campreplies_tenant"   ON "receptionist_campaign_replies" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_rcp_campreplies_campaign" ON "receptionist_campaign_replies" ((data->>'campaign_id'));
CREATE INDEX IF NOT EXISTS "idx_rcp_campreplies_class"    ON "receptionist_campaign_replies" ((data->>'classification'));

-- ── Row Level Security (enable; no anon/authenticated policies → deny-all) ────

ALTER TABLE "receptionist_conversations"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_messages"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_actions"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_contacts"         ENABLE ROW LEVEL SECURITY;  -- PII (leads)
ALTER TABLE "receptionist_companies"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_bookings"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_quotes"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_callbacks"        ENABLE ROW LEVEL SECURITY;  -- PII (phone)
ALTER TABLE "receptionist_voicemails"       ENABLE ROW LEVEL SECURITY;  -- PII
ALTER TABLE "receptionist_waitlist"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_payments"         ENABLE ROW LEVEL SECURITY;  -- financial
ALTER TABLE "receptionist_tickets"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_escalations"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_tasks"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_reminders"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_optouts"          ENABLE ROW LEVEL SECURITY;  -- compliance
ALTER TABLE "receptionist_business_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_knowledge"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "receptionist_campaign_replies" ENABLE ROW LEVEL SECURITY;

-- ── FUTURE (only if a table is ever exposed to the browser Supabase client) ──
-- Per-workspace policy template — requires tenant_id to be derivable from the
-- signed-in user (NOT the case today, so left commented):
--
-- CREATE POLICY "members read own workspace rows" ON "receptionist_contacts"
--   FOR SELECT TO authenticated
--   USING (
--     tenant_id IN (
--       SELECT 'ws_' || wm.workspace_id::text
--       FROM workspace_members wm
--       WHERE wm.user_id = auth.uid()
--     )
--   );
