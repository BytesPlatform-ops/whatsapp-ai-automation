-- ============================================================================
-- Pixie service-integration tables — Row Level Security (RLS)
-- ============================================================================
-- Apply this ONCE after creating the service tables via `npm run db:push`
-- (Option 1 in docs/pixie-services-setup.md). If you use Option 2 (Prisma
-- migration baseline + `npm run db:migrate`), RLS is already included in
-- landing/prisma/migrations/0003_service_integrations and you do NOT need this
-- file — it is kept as the single source for the RLS statements.
--
-- Paste into: Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to re-run: ENABLE ROW LEVEL SECURITY is idempotent.
--
-- SECURITY MODEL (why these policies look "empty"):
--   These tables are written/read ONLY by the Python backend using the Supabase
--   SERVICE-ROLE key, which BYPASSES RLS. The browser NEVER queries them via the
--   Supabase client — all product access goes through the Next.js /api/lab/*
--   proxies, which resolve the workspace tenant SERVER-SIDE. Therefore the
--   correct policy is: enable RLS with NO permissive policies for the `anon` and
--   `authenticated` roles → those roles can read/write NOTHING, so there is no
--   cross-workspace leakage even if a client obtained a direct connection.
--
--   We deliberately do NOT add auth.uid()/workspace-membership policies here,
--   because `tenant_id` is a free-form backend tenant string (e.g. "ws_<id>",
--   plus system/demo tenants) and is NOT mapped to Supabase auth.users. If these
--   tables are ever exposed to the browser via the Supabase client, add
--   per-workspace policies at that point (see the commented template at the end).
-- ============================================================================

ALTER TABLE "pixie_kv"                  ENABLE ROW LEVEL SECURITY;  -- Meta/SEO tokens + caches (most sensitive)
ALTER TABLE "approval_items"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_logs"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "content_assets"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meta_content_items"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tool_executions"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meta_inbox_items"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_audits"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_pages"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_issues"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seo_optimization_actions"  ENABLE ROW LEVEL SECURITY;

-- App/workspace tables (workspaces, workspace_members, workspace_services, …)
-- are owned by Prisma and accessed ONLY from Next server code via the Prisma
-- client (also server-side). They are not browser-queried either; RLS on them is
-- optional and not relied upon (see landing/prisma/schema.prisma header). Enable
-- it too if you want defense-in-depth:
-- ALTER TABLE "workspace_services" ENABLE ROW LEVEL SECURITY;

-- ── FUTURE (only if a table is ever exposed to the browser Supabase client) ──
-- Example per-workspace policy — requires tenant_id to equal a value derivable
-- from the signed-in user (not the case today, so left commented):
--
-- CREATE POLICY "members read own workspace rows" ON "seo_audits"
--   FOR SELECT TO authenticated
--   USING (
--     tenant_id IN (
--       SELECT 'ws_' || wm.workspace_id::text
--       FROM workspace_members wm
--       WHERE wm.user_id = auth.uid()
--     )
--   );
