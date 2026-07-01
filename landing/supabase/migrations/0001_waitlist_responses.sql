-- Pixie waitlist responses — run once in Supabase → SQL Editor.
-- Mirrors landing/prisma/schema.prisma (model WaitlistResponse).

create extension if not exists "pgcrypto";

create table if not exists public.waitlist_responses (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text not null default '',
  business   text not null default '',
  contact    text not null default '',
  email      text not null,
  roles      integer not null default 0,
  selected   text[] not null default '{}',   -- services swiped right (interested)
  rejected   text[] not null default '{}',   -- services swiped left (not interested)
  ip         text,
  source     text not null default 'join-pixie'
);

create index if not exists waitlist_responses_created_at_idx
  on public.waitlist_responses (created_at desc);

-- Lock the table down: with RLS enabled and no policies, the anon and
-- authenticated roles cannot read or write it. Only the service-role key
-- (used server-side by the API route + admin panel) bypasses RLS.
alter table public.waitlist_responses enable row level security;
