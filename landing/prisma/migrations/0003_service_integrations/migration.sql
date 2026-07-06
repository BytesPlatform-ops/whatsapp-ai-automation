-- 0003_service_integrations
-- Backend service-integration tables (SEO / Meta / Content) — the JSONB
-- "envelope" tables the Python FastAPI backend reads/writes via the Supabase
-- service-role REST API. This migration makes Prisma the single source of truth
-- for these tables, replacing the manual backend/meta/migrations.sql run.
--
-- Idempotent (IF NOT EXISTS) so it applies cleanly whether or not the legacy SQL
-- already created the tables on this database.

-- CreateTable
CREATE TABLE IF NOT EXISTS "pixie_kv" (
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pixie_kv_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "approval_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "activity_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "content_assets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "meta_content_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_content_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "tool_executions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "meta_inbox_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meta_inbox_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "seo_audits" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seo_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "seo_pages" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seo_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "seo_issues" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seo_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "seo_optimization_actions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seo_optimization_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "approval_items_tenant_id_created_at_idx" ON "approval_items"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "activity_logs_tenant_id_created_at_idx" ON "activity_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "content_assets_tenant_id_created_at_idx" ON "content_assets"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "meta_content_items_tenant_id_created_at_idx" ON "meta_content_items"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tool_executions_tenant_id_created_at_idx" ON "tool_executions"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "meta_inbox_items_tenant_id_created_at_idx" ON "meta_inbox_items"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "seo_audits_tenant_id_created_at_idx" ON "seo_audits"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "seo_pages_tenant_id_created_at_idx" ON "seo_pages"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "seo_issues_tenant_id_created_at_idx" ON "seo_issues"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "seo_optimization_actions_tenant_id_created_at_idx" ON "seo_optimization_actions"("tenant_id", "created_at");

-- Row Level Security: these tables are accessed ONLY by the backend via the
-- service-role key (which bypasses RLS). Enable RLS with NO anon/authenticated
-- policies so no client can read them directly (tokens in pixie_kv stay server-side).
ALTER TABLE "pixie_kv" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "approval_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "content_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meta_content_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tool_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meta_inbox_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_audits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_pages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_issues" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_optimization_actions" ENABLE ROW LEVEL SECURITY;
