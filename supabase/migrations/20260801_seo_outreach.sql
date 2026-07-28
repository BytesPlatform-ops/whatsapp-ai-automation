-- ============================================================================
-- SEO Outreach vertical — durable Supabase schema (tables + indexes + RLS)
-- ============================================================================
-- Companion to 20260729_seo_search_intelligence.sql. Apply ONCE in Supabase
-- → SQL Editor → New query → Run. Safe to re-run (all DDL is IF NOT EXISTS /
-- ENABLE RLS — idempotent). Do NOT auto-apply; the backend has no migration
-- runner.
--
-- Same envelope shape as every other Pixie durable table:
--     { id, tenant_id, created_at, updated_at, data (jsonb) }
-- Written/read ONLY by the backend via the SERVICE-ROLE key (bypasses RLS).
-- The browser never queries these. RLS ENABLED with NO anon/authenticated
-- policy → deny-all → zero cross-tenant leak.
--
-- Backing repositories: backend/seo/outreach/stores.py (ALL_REPOSITORIES).
-- NOTE: No digits in table names — the migration-coverage regex is digit-blind.
--
-- ENTITIES (6)
--   seo_outreach_contacts    — outreach prospect contacts
--   seo_outreach_campaigns   — outreach campaigns (lifecycle: draft → won/declined)
--   seo_outreach_drafts      — AI-generated + human-edited email drafts
--   seo_outreach_followups   — durable follow-up schedule records
--   seo_link_placements      — earned-link / citation / mention tracking
--   seo_outreach_suppression — do-not-email suppression list
-- ============================================================================

-- ── Tables (all share the envelope shape) ───────────────────────────────────

-- Outreach contacts. One row per (tenant, normalised email).
-- Hot fields in data: email, domain, verification_status, relationship_status,
--   do_not_contact, bounce_status.
CREATE TABLE IF NOT EXISTS "seo_outreach_contacts" (
  "id"         text        PRIMARY KEY,
  "tenant_id"  text        NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data"       jsonb       NOT NULL DEFAULT '{}'::jsonb
);

-- Outreach campaigns. One row per campaign attempt.
-- Hot fields in data: site_id, opportunity_id, status, campaign_type.
CREATE TABLE IF NOT EXISTS "seo_outreach_campaigns" (
  "id"         text        PRIMARY KEY,
  "tenant_id"  text        NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data"       jsonb       NOT NULL DEFAULT '{}'::jsonb
);

-- AI-generated (and human-edited) email drafts. Versioned.
-- Hot fields in data: campaign_id, contact_id, status, approved, version.
CREATE TABLE IF NOT EXISTS "seo_outreach_drafts" (
  "id"         text        PRIMARY KEY,
  "tenant_id"  text        NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data"       jsonb       NOT NULL DEFAULT '{}'::jsonb
);

-- Durable follow-up schedule rows. Status: scheduled → sent | stopped | skipped.
-- Hot fields in data: campaign_id, contact_id, status, scheduled_for.
CREATE TABLE IF NOT EXISTS "seo_outreach_followups" (
  "id"         text        PRIMARY KEY,
  "tenant_id"  text        NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data"       jsonb       NOT NULL DEFAULT '{}'::jsonb
);

-- Earned-link / citation / mention placement tracking.
-- Hot fields in data: campaign_id, contact_id, outcome, source_url, target_url.
CREATE TABLE IF NOT EXISTS "seo_link_placements" (
  "id"         text        PRIMARY KEY,
  "tenant_id"  text        NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data"       jsonb       NOT NULL DEFAULT '{}'::jsonb
);

-- Suppression list. Rows prevent future outreach to an email/domain.
-- Hot fields in data: email, domain, reason.
CREATE TABLE IF NOT EXISTS "seo_outreach_suppression" (
  "id"         text        PRIMARY KEY,
  "tenant_id"  text        NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "data"       jsonb       NOT NULL DEFAULT '{}'::jsonb
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- Every table: (tenant_id) + (tenant_id, created_at DESC).
-- Hot FK / filter fields: expression indexes on data->>'field'.
-- Unique: (tenant_id, email) for contacts and suppression to prevent dupes.

-- seo_outreach_contacts
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_contacts_tenant"
  ON "seo_outreach_contacts" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_contacts_created"
  ON "seo_outreach_contacts" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_contacts_email"
  ON "seo_outreach_contacts" ((data->>'email'));
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_contacts_domain"
  ON "seo_outreach_contacts" ((data->>'domain'));
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_contacts_rel_status"
  ON "seo_outreach_contacts" ((data->>'relationship_status'));
-- Unique (tenant_id, email) — prevent duplicate contacts per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_seo_outreach_contacts_tenant_email"
  ON "seo_outreach_contacts" ("tenant_id", (data->>'email'))
  WHERE (data->>'email') IS NOT NULL AND (data->>'email') != '';

-- seo_outreach_campaigns
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_campaigns_tenant"
  ON "seo_outreach_campaigns" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_campaigns_created"
  ON "seo_outreach_campaigns" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_campaigns_site"
  ON "seo_outreach_campaigns" ((data->>'site_id'));
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_campaigns_status"
  ON "seo_outreach_campaigns" ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_campaigns_type"
  ON "seo_outreach_campaigns" ((data->>'campaign_type'));
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_campaigns_opportunity"
  ON "seo_outreach_campaigns" ((data->>'opportunity_id'));

-- seo_outreach_drafts
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_drafts_tenant"
  ON "seo_outreach_drafts" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_drafts_created"
  ON "seo_outreach_drafts" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_drafts_campaign"
  ON "seo_outreach_drafts" ((data->>'campaign_id'));
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_drafts_contact"
  ON "seo_outreach_drafts" ((data->>'contact_id'));
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_drafts_status"
  ON "seo_outreach_drafts" ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_drafts_approved"
  ON "seo_outreach_drafts" ((data->>'approved'));

-- seo_outreach_followups
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_followups_tenant"
  ON "seo_outreach_followups" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_followups_created"
  ON "seo_outreach_followups" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_followups_campaign"
  ON "seo_outreach_followups" ((data->>'campaign_id'));
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_followups_contact"
  ON "seo_outreach_followups" ((data->>'contact_id'));
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_followups_status"
  ON "seo_outreach_followups" ((data->>'status'));
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_followups_scheduled"
  ON "seo_outreach_followups" ((data->>'scheduled_for'));

-- seo_link_placements
CREATE INDEX IF NOT EXISTS "idx_seo_link_placements_tenant"
  ON "seo_link_placements" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_link_placements_created"
  ON "seo_link_placements" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_link_placements_campaign"
  ON "seo_link_placements" ((data->>'campaign_id'));
CREATE INDEX IF NOT EXISTS "idx_seo_link_placements_contact"
  ON "seo_link_placements" ((data->>'contact_id'));
CREATE INDEX IF NOT EXISTS "idx_seo_link_placements_outcome"
  ON "seo_link_placements" ((data->>'outcome'));

-- seo_outreach_suppression
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_suppression_tenant"
  ON "seo_outreach_suppression" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_suppression_created"
  ON "seo_outreach_suppression" ("tenant_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_suppression_email"
  ON "seo_outreach_suppression" ((data->>'email'));
CREATE INDEX IF NOT EXISTS "idx_seo_outreach_suppression_domain"
  ON "seo_outreach_suppression" ((data->>'domain'));
-- Unique (tenant_id, email) for suppression.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_seo_outreach_suppression_tenant_email"
  ON "seo_outreach_suppression" ("tenant_id", (data->>'email'))
  WHERE (data->>'email') IS NOT NULL AND (data->>'email') != '';

-- ── Row Level Security (enable; no anon/authenticated policy → deny-all) ────
ALTER TABLE "seo_outreach_contacts"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_outreach_campaigns"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_outreach_drafts"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_outreach_followups"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_link_placements"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_outreach_suppression" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- MIGRATION CHECKLIST
--   [x] 6 tables created, each matching an _AutoRepo.table_name in
--       backend/seo/outreach/stores.py (ALL_REPOSITORIES)
--   [x] No digits in any table name (migration-coverage regex safe)
--   [x] Every table has (tenant_id) + (tenant_id, created_at DESC) indexes
--   [x] Expression indexes on data->>'field' for campaign_id, contact_id,
--       status, scheduled_for, outcome, email, domain
--   [x] Unique (tenant_id, email) index on contacts + suppression tables
--       to prevent duplicate rows
--   [x] RLS ENABLED on all 6 tables (no anon/authenticated policy = deny-all)
--   [x] All DDL is IF NOT EXISTS — idempotent, safe to re-run
--   [x] NOT auto-applied; apply once in Supabase SQL Editor
-- ============================================================================
