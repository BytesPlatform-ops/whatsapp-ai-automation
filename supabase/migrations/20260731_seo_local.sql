-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Pixie — SEO Local Vertical migration                                    ║
-- ║  Created: 2026-07-31                                                     ║
-- ║  Apply via: supabase db push  (or psql -f this file)                    ║
-- ║                                                                          ║
-- ║  Design: normalised ROW envelope per record                              ║
-- ║    (id TEXT PK, tenant_id TEXT, created_at, updated_at, data JSONB)     ║
-- ║  Queryable fields live inside `data` via data->>'field' expression       ║
-- ║  indexes.  RLS is deny-all (service-role access only).                  ║
-- ║                                                                          ║
-- ║  Checklist before applying:                                              ║
-- ║  [ ] Run on a staging DB first                                           ║
-- ║  [ ] Verify no existing tables conflict                                  ║
-- ║  [ ] Confirm RLS policies don't block service-role writes               ║
-- ║  [ ] All table names have NO DIGITS (migration-coverage regex is         ║
-- ║      digit-blind; table names spell out words)                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── seo_locations ────────────────────────────────────────────────────────────
-- Business location records (physical premises, service areas).

create table if not exists seo_locations (
  id         text primary key,
  tenant_id  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data       jsonb not null default '{}'::jsonb
);

create index if not exists idx_seo_locations_tenant
  on seo_locations (tenant_id, created_at desc);

create index if not exists idx_seo_locations_site
  on seo_locations ((data->>'site_id'), tenant_id)
  where data->>'site_id' is not null;

create index if not exists idx_seo_locations_archived
  on seo_locations ((data->>'archived'), tenant_id);

alter table seo_locations enable row level security;

-- deny all direct client access; service-role bypasses RLS
create policy seo_locations_deny_all on seo_locations
  as restrictive for all to public using (false);


-- ── seo_gbp_connections ───────────────────────────────────────────────────────
-- Google Business Profile OAuth connections.
-- Tokens stored sealed (encrypted); NEVER plaintext in this table.

create table if not exists seo_gbp_connections (
  id         text primary key,
  tenant_id  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data       jsonb not null default '{}'::jsonb
);

create index if not exists idx_seo_gbp_connections_tenant
  on seo_gbp_connections (tenant_id, created_at desc);

create index if not exists idx_seo_gbp_connections_status
  on seo_gbp_connections ((data->>'status'), tenant_id);

alter table seo_gbp_connections enable row level security;

create policy seo_gbp_connections_deny_all on seo_gbp_connections
  as restrictive for all to public using (false);


-- ── seo_gbp_reviews ───────────────────────────────────────────────────────────
-- GBP customer reviews + AI-drafted responses (approval-gated).

create table if not exists seo_gbp_reviews (
  id         text primary key,
  tenant_id  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data       jsonb not null default '{}'::jsonb
);

create index if not exists idx_seo_gbp_reviews_tenant
  on seo_gbp_reviews (tenant_id, created_at desc);

create index if not exists idx_seo_gbp_reviews_location
  on seo_gbp_reviews ((data->>'location_id'), tenant_id);

create index if not exists idx_seo_gbp_reviews_reply_status
  on seo_gbp_reviews ((data->>'reply_status'), tenant_id);

create index if not exists idx_seo_gbp_reviews_handled
  on seo_gbp_reviews ((data->>'handled'), tenant_id);

alter table seo_gbp_reviews enable row level security;

create policy seo_gbp_reviews_deny_all on seo_gbp_reviews
  as restrictive for all to public using (false);


-- ── seo_gbp_posts ─────────────────────────────────────────────────────────────
-- Google Business Profile posts (updates / offers / events).

create table if not exists seo_gbp_posts (
  id         text primary key,
  tenant_id  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data       jsonb not null default '{}'::jsonb
);

create index if not exists idx_seo_gbp_posts_tenant
  on seo_gbp_posts (tenant_id, created_at desc);

create index if not exists idx_seo_gbp_posts_location
  on seo_gbp_posts ((data->>'location_id'), tenant_id);

create index if not exists idx_seo_gbp_posts_status
  on seo_gbp_posts ((data->>'status'), tenant_id);

alter table seo_gbp_posts enable row level security;

create policy seo_gbp_posts_deny_all on seo_gbp_posts
  as restrictive for all to public using (false);


-- ── seo_citation_sources ──────────────────────────────────────────────────────
-- Known citation directories / aggregators (shared across tenants).

create table if not exists seo_citation_sources (
  id         text primary key,
  tenant_id  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data       jsonb not null default '{}'::jsonb
);

create index if not exists idx_seo_citation_sources_tenant
  on seo_citation_sources (tenant_id, created_at desc);

create index if not exists idx_seo_citation_sources_kind
  on seo_citation_sources ((data->>'kind'), tenant_id);

alter table seo_citation_sources enable row level security;

create policy seo_citation_sources_deny_all on seo_citation_sources
  as restrictive for all to public using (false);


-- ── seo_citations ─────────────────────────────────────────────────────────────
-- Citation listings per location per directory.

create table if not exists seo_citations (
  id         text primary key,
  tenant_id  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data       jsonb not null default '{}'::jsonb
);

create index if not exists idx_seo_citations_tenant
  on seo_citations (tenant_id, created_at desc);

create index if not exists idx_seo_citations_location
  on seo_citations ((data->>'location_id'), tenant_id);

create index if not exists idx_seo_citations_status
  on seo_citations ((data->>'status'), tenant_id);

create index if not exists idx_seo_citations_directory
  on seo_citations ((data->>'directory'), tenant_id);

alter table seo_citations enable row level security;

create policy seo_citations_deny_all on seo_citations
  as restrictive for all to public using (false);


-- ── seo_local_competitors ─────────────────────────────────────────────────────
-- Local competitor businesses tracked per location.

create table if not exists seo_local_competitors (
  id         text primary key,
  tenant_id  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data       jsonb not null default '{}'::jsonb
);

create index if not exists idx_seo_local_competitors_tenant
  on seo_local_competitors (tenant_id, created_at desc);

create index if not exists idx_seo_local_competitors_location
  on seo_local_competitors ((data->>'location_id'), tenant_id);

alter table seo_local_competitors enable row level security;

create policy seo_local_competitors_deny_all on seo_local_competitors
  as restrictive for all to public using (false);


-- ── seo_local_rank_snapshots ──────────────────────────────────────────────────
-- Point-in-time local SERP rank snapshots (organic + local-pack + maps).
-- NEVER contains fabricated geo-grid positions: is_geo_grid flag is stored
-- and only set True when the provider supplied real grid data.

create table if not exists seo_local_rank_snapshots (
  id         text primary key,
  tenant_id  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data       jsonb not null default '{}'::jsonb
);

create index if not exists idx_seo_local_rank_snapshots_tenant
  on seo_local_rank_snapshots (tenant_id, created_at desc);

create index if not exists idx_seo_local_rank_snapshots_location
  on seo_local_rank_snapshots ((data->>'location_id'), tenant_id);

create index if not exists idx_seo_local_rank_snapshots_keyword
  on seo_local_rank_snapshots ((data->>'keyword'), tenant_id);

create index if not exists idx_seo_local_rank_snapshots_date
  on seo_local_rank_snapshots ((data->>'date') desc, tenant_id);

alter table seo_local_rank_snapshots enable row level security;

create policy seo_local_rank_snapshots_deny_all on seo_local_rank_snapshots
  as restrictive for all to public using (false);


-- ── seo_nap_audits ───────────────────────────────────────────────────────────
-- NAP (Name / Address / Phone) consistency audit rows per source/field.

create table if not exists seo_nap_audits (
  id         text primary key,
  tenant_id  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data       jsonb not null default '{}'::jsonb
);

create index if not exists idx_seo_nap_audits_tenant
  on seo_nap_audits (tenant_id, created_at desc);

create index if not exists idx_seo_nap_audits_location
  on seo_nap_audits ((data->>'location_id'), tenant_id);

create index if not exists idx_seo_nap_audits_mismatch
  on seo_nap_audits ((data->>'mismatch'), tenant_id);

alter table seo_nap_audits enable row level security;

create policy seo_nap_audits_deny_all on seo_nap_audits
  as restrictive for all to public using (false);


-- ── seo_local_schema ─────────────────────────────────────────────────────────
-- LocalBusiness JSON-LD schema proposals + approval records.
-- AggregateRating only included when policy_compliant_rating=True (manual gate).

create table if not exists seo_local_schema (
  id         text primary key,
  tenant_id  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data       jsonb not null default '{}'::jsonb
);

create index if not exists idx_seo_local_schema_tenant
  on seo_local_schema (tenant_id, created_at desc);

create index if not exists idx_seo_local_schema_location
  on seo_local_schema ((data->>'location_id'), tenant_id);

create index if not exists idx_seo_local_schema_status
  on seo_local_schema ((data->>'status'), tenant_id);

alter table seo_local_schema enable row level security;

create policy seo_local_schema_deny_all on seo_local_schema
  as restrictive for all to public using (false);


-- ── Grants (adjust role names for your Supabase project) ──────────────────────
-- service_role already bypasses RLS; these grants are for completeness.
-- grant all on seo_locations, seo_gbp_connections, seo_gbp_reviews,
--   seo_gbp_posts, seo_citation_sources, seo_citations,
--   seo_local_competitors, seo_local_rank_snapshots,
--   seo_nap_audits, seo_local_schema
-- to service_role;
