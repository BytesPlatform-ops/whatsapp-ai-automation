-- 0005_content_agent
-- General Content Agent tables — JSONB "envelope" tables the Python backend
-- reads/writes via the Supabase service-role REST API
-- (backend/persistence.py -> persistence.table("ca_*")). Same shape/access model
-- as the content_creator cc_* tables (0004): (id, tenant_id, created_at,
-- updated_at, data jsonb), tenant-scoped, RLS on with NO client policies.
--
-- Stores generated WRITTEN content documents + their version history + a light
-- generation-job audit. Separate from content_assets (media) and cc_* (influencer).
--
-- Idempotent (IF NOT EXISTS). APPLY WITH: cd landing && npm run db:migrate
-- NOTE: applying a schema change requires human approval per CLAUDE.md — this
-- file is created and validated but NOT auto-applied.

CREATE TABLE IF NOT EXISTS "ca_documents" (
  "id"         TEXT NOT NULL,
  "tenant_id"  TEXT NOT NULL,
  "data"       JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "ca_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ca_versions" (
  "id"         TEXT NOT NULL,
  "tenant_id"  TEXT NOT NULL,
  "data"       JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "ca_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ca_jobs" (
  "id"         TEXT NOT NULL,
  "tenant_id"  TEXT NOT NULL,
  "data"       JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "ca_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ca_documents_tenant_id_created_at_idx" ON "ca_documents"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "ca_versions_tenant_id_created_at_idx" ON "ca_versions"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "ca_jobs_tenant_id_created_at_idx" ON "ca_jobs"("tenant_id", "created_at");

-- Row Level Security: backend-only (service-role bypasses RLS); no client policies.
ALTER TABLE "ca_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ca_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ca_jobs" ENABLE ROW LEVEL SECURITY;
