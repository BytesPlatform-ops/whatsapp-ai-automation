-- 0004_content_creator
-- Content Creator (AI Influencer) pipeline tables — the JSONB "envelope" tables
-- the Python FastAPI backend reads/writes via the Supabase service-role REST API
-- (backend/persistence.py -> persistence.table("cc_*")). Same shape and access
-- model as the SEO / Meta / Content tables in 0003_service_integrations:
--   (id, tenant_id, created_at, updated_at, data jsonb), one row per record,
--   tenant-scoped on every read, RLS on with NO client policies (service-role only).
--
-- These replace the process-local in-memory repositories in
-- backend/content_creator/store.py so pipeline state survives backend restarts
-- and is multi-instance safe. The backend selects durable mode via
-- PIXIE_PERSIST=supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY); with
-- PIXIE_PERSIST unset it stays in-memory (hermetic tests / local dev).
--
-- Idempotent (IF NOT EXISTS) so it is safe to (re)apply. APPLY WITH:
--   cd landing && npm run db:migrate        # prisma migrate deploy
-- NOTE: applying a schema change requires human approval per CLAUDE.md — this
-- file is created and validated but NOT auto-applied.

-- CreateTable
CREATE TABLE IF NOT EXISTS "cc_profiles" (
  "id"         TEXT NOT NULL,
  "tenant_id"  TEXT NOT NULL,
  "data"       JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "cc_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "cc_identities" (
  "id"         TEXT NOT NULL,
  "tenant_id"  TEXT NOT NULL,
  "data"       JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "cc_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "cc_provider_connections" (
  "id"         TEXT NOT NULL,
  "tenant_id"  TEXT NOT NULL,
  "data"       JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "cc_provider_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "cc_credentials" (
  "id"         TEXT NOT NULL,
  "tenant_id"  TEXT NOT NULL,
  "data"       JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "cc_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "cc_ideas" (
  "id"         TEXT NOT NULL,
  "tenant_id"  TEXT NOT NULL,
  "data"       JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "cc_ideas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "cc_scripts" (
  "id"         TEXT NOT NULL,
  "tenant_id"  TEXT NOT NULL,
  "data"       JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "cc_scripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "cc_approvals" (
  "id"         TEXT NOT NULL,
  "tenant_id"  TEXT NOT NULL,
  "data"       JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "cc_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "cc_videos" (
  "id"         TEXT NOT NULL,
  "tenant_id"  TEXT NOT NULL,
  "data"       JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "cc_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "cc_quality_checks" (
  "id"         TEXT NOT NULL,
  "tenant_id"  TEXT NOT NULL,
  "data"       JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "cc_quality_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "cc_posts" (
  "id"         TEXT NOT NULL,
  "tenant_id"  TEXT NOT NULL,
  "data"       JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "cc_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "cc_metrics" (
  "id"         TEXT NOT NULL,
  "tenant_id"  TEXT NOT NULL,
  "data"       JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "cc_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "cc_usage" (
  "id"         TEXT NOT NULL,
  "tenant_id"  TEXT NOT NULL,
  "data"       JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "cc_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "cc_learnings" (
  "id"         TEXT NOT NULL,
  "tenant_id"  TEXT NOT NULL,
  "data"       JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "cc_learnings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (tenant-scoped listing, ordered by created_at — matches persistence.list_by_tenant)
CREATE INDEX IF NOT EXISTS "cc_profiles_tenant_id_created_at_idx" ON "cc_profiles"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "cc_identities_tenant_id_created_at_idx" ON "cc_identities"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "cc_provider_connections_tenant_id_created_at_idx" ON "cc_provider_connections"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "cc_credentials_tenant_id_created_at_idx" ON "cc_credentials"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "cc_ideas_tenant_id_created_at_idx" ON "cc_ideas"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "cc_scripts_tenant_id_created_at_idx" ON "cc_scripts"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "cc_approvals_tenant_id_created_at_idx" ON "cc_approvals"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "cc_videos_tenant_id_created_at_idx" ON "cc_videos"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "cc_quality_checks_tenant_id_created_at_idx" ON "cc_quality_checks"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "cc_posts_tenant_id_created_at_idx" ON "cc_posts"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "cc_metrics_tenant_id_created_at_idx" ON "cc_metrics"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "cc_usage_tenant_id_created_at_idx" ON "cc_usage"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "cc_learnings_tenant_id_created_at_idx" ON "cc_learnings"("tenant_id", "created_at");

-- Row Level Security: accessed ONLY by the backend via the service-role key
-- (which bypasses RLS). Enable RLS with NO anon/authenticated policies so no
-- browser client can read these tables directly. cc_credentials additionally
-- only ever stores a Fernet-sealed credential, never plaintext.
ALTER TABLE "cc_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cc_identities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cc_provider_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cc_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cc_ideas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cc_scripts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cc_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cc_videos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cc_quality_checks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cc_posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cc_metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cc_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cc_learnings" ENABLE ROW LEVEL SECURITY;
