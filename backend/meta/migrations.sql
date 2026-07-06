-- Pixie — Supabase/Postgres schema for PIXIE_PERSIST=supabase.
--
-- Run once in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run),
-- then set PIXIE_PERSIST=supabase and restart the backend.
--
-- Design: the persistence layer stores each transactional record as a normalized
-- ROW (one row per record, so concurrent writers never clobber each other) with a
-- stable id + tenant_id + timestamps + a `data` JSONB payload. Fields stay
-- queryable in Postgres via data->>'field' (e.g.
--   select data->>'status' from approval_items where tenant_id = '...').
-- Low-churn per-tenant caches (Meta asset cache, connection tokens) use a single
-- key/value table (pixie_kv). Tokens live ONLY here (service-role access), never
-- returned to the frontend.

-- ── key/value blobs (Meta asset cache + connection tokens) ────────────────────
create table if not exists pixie_kv (
  name       text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── transactional row tables (envelope: id, tenant_id, timestamps, data jsonb) ─
create table if not exists approval_items (
  id         text primary key,
  tenant_id  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data       jsonb not null default '{}'::jsonb
);

create table if not exists activity_logs (
  id         text primary key,
  tenant_id  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data       jsonb not null default '{}'::jsonb
);

create table if not exists content_assets (
  id         text primary key,
  tenant_id  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data       jsonb not null default '{}'::jsonb
);

create table if not exists meta_content_items (
  id         text primary key,
  tenant_id  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data       jsonb not null default '{}'::jsonb
);

create table if not exists tool_executions (
  id         text primary key,
  tenant_id  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data       jsonb not null default '{}'::jsonb
);

-- inbox (comments/DMs) + SEO agent (audits/pages/issues/actions), same envelope shape
create table if not exists meta_inbox_items (
  id text primary key, tenant_id text not null, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), data jsonb not null default '{}'::jsonb);
create table if not exists seo_audits (
  id text primary key, tenant_id text not null, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), data jsonb not null default '{}'::jsonb);
create table if not exists seo_pages (
  id text primary key, tenant_id text not null, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), data jsonb not null default '{}'::jsonb);
create table if not exists seo_issues (
  id text primary key, tenant_id text not null, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), data jsonb not null default '{}'::jsonb);
create table if not exists seo_optimization_actions (
  id text primary key, tenant_id text not null, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), data jsonb not null default '{}'::jsonb);

create index if not exists idx_meta_inbox_tenant    on meta_inbox_items(tenant_id, created_at);
create index if not exists idx_seo_audits_tenant    on seo_audits(tenant_id, created_at);
create index if not exists idx_seo_issues_tenant    on seo_issues(tenant_id, created_at);
create index if not exists idx_seo_pages_tenant     on seo_pages(tenant_id, created_at);
create index if not exists idx_seo_opt_tenant       on seo_optimization_actions(tenant_id, created_at);
alter table meta_inbox_items          enable row level security;
alter table seo_audits                enable row level security;
alter table seo_pages                 enable row level security;
alter table seo_issues                enable row level security;
alter table seo_optimization_actions  enable row level security;

create index if not exists idx_approval_items_tenant     on approval_items(tenant_id, created_at);
create index if not exists idx_activity_logs_tenant      on activity_logs(tenant_id, created_at);
create index if not exists idx_content_assets_tenant     on content_assets(tenant_id, created_at);
create index if not exists idx_meta_content_items_tenant on meta_content_items(tenant_id, created_at);
create index if not exists idx_tool_executions_tenant    on tool_executions(tenant_id, created_at);

-- RLS: these tables are written/read ONLY by the backend via the service-role key
-- (which bypasses RLS). Enable RLS with no anon/authenticated policies so no client
-- can read them directly — tokens in pixie_kv stay server-side.
alter table pixie_kv           enable row level security;
alter table approval_items     enable row level security;
alter table activity_logs      enable row level security;
alter table content_assets     enable row level security;
alter table meta_content_items enable row level security;
alter table tool_executions    enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- FUTURE (optional): fully-normalized columns, if you later want SQL analytics
-- without JSONB accessors. Not used by the current adapter.
--
-- create table meta_connections (id text primary key, tenant_id text, user_id text,
--   provider text default 'meta', status text, meta_user_id text, access_token_ref text,
--   token_type text, expires_at timestamptz, scopes jsonb, connected_name text,
--   created_at timestamptz default now(), updated_at timestamptz default now(),
--   last_refreshed_at timestamptz);
-- create table meta_business_assets (id text primary key, tenant_id text,
--   connection_id text, asset_type text, asset_id text, asset_name text,
--   parent_business_id text, page_id text, instagram_business_account_id text,
--   ad_account_id text, permissions jsonb, is_default boolean, status text,
--   metadata_json jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
-- create table marketing_recommendations (id text primary key, tenant_id text,
--   agent_slug text default 'marketing-agent', source_provider text default 'meta',
--   source_asset_id text, title text, summary text, recommendation_type text,
--   priority text, prepared_output_json jsonb, status text, approval_id text,
--   created_at timestamptz default now(), updated_at timestamptz default now());
