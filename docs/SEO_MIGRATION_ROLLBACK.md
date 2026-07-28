# SEO Migration Rollback Runbook

This runbook describes the rollback posture for each of the six SEO migrations. All SEO
migrations create new tables only — there are no ALTER TABLE statements that modify existing
tables. This means rollback for every migration is a DROP TABLE (and DROP POLICY / DROP INDEX
where applicable). **Never auto-drop production tables**; always take a backup first.

## General Principles

- All six migrations are additive (new tables only). No existing tables are modified.
- Rollback = dropping the tables created by the migration. All data in those tables is lost.
- Because all references between tables are stored inside the `data` JSONB column (not enforced
  foreign keys), dropping one migration's tables does not cause FK constraint failures in the
  remaining tables. The application layer may error if it queries a dropped table.
- Before rolling back any migration, take a Supabase backup (Dashboard → Database → Backups or
  `pg_dump`). For a fresh migration with zero production data, a backup is still recommended
  for audit purposes.
- After rollback, the code that references the dropped tables must be disabled or rolled back
  simultaneously, or the application will throw errors on table-not-found.

---

## Migration 1 — `20260728_seo.sql`

**Tables:** `seo_sites`, `seo_crawl_jobs`, `seo_crawled_pages`, `seo_issues`, `seo_reports`

**Safe rollback possibility:** Yes, if no downstream migrations (2–6) have been applied and
no application data has been written. If any of migrations 2–6 are already applied, those
tables reference `site_id` values from `seo_sites` — dropping migration 1's tables while
keeping later tables leaves orphaned JSON references (not FK errors, since references are
inside JSONB, but the application will fail to resolve sites).

**Data-loss risk:** All crawl jobs, crawled pages, issues, and reports are permanently deleted.
This is irreversible.

**Reversible vs irreversible:** Irreversible once rows exist. Structure is reversible by
re-running the migration file (IF NOT EXISTS means re-running is safe after DROP).

**Backup requirement:** Required before DROP if any rows exist.

**Recovery commands:**

```sql
-- Run ONLY after taking a backup. DESTROYS ALL DATA IN THESE TABLES.
-- Also requires rolling back migrations 2-6 first if they were applied.

DROP TABLE IF EXISTS "seo_reports";
DROP TABLE IF EXISTS "seo_issues";
DROP TABLE IF EXISTS "seo_crawled_pages";
DROP TABLE IF EXISTS "seo_crawl_jobs";
DROP TABLE IF EXISTS "seo_sites";
```

**Verification steps:**
```sql
SELECT COUNT(*) FROM information_schema.tables
WHERE table_name IN ('seo_sites','seo_crawl_jobs','seo_crawled_pages','seo_issues','seo_reports')
AND table_schema = 'public';
-- Expected: 0
```

**Forward-fix strategy:** If rollback is unsafe (data exists in dependent tables), deploy a
code fix instead. Set `PIXIE_PERSIST=memory` or `file` to bypass Supabase writes temporarily
while the schema issue is resolved.

---

## Migration 2 — `20260729_seo_search_intelligence.sql`

**Tables (18):** `seo_google_connections`, `seo_google_properties`, `seo_gsc_sync_jobs`,
`seo_gsc_query_rows`, `seo_analytics_sync_jobs`, `seo_analytics_landing_rows`,
`seo_keyword_projects`, `seo_keywords`, `seo_keyword_metrics`, `seo_keyword_clusters`,
`seo_rank_jobs`, `seo_rank_snapshots`, `seo_competitors`, `seo_competitor_snapshots`,
`seo_opportunities`, `seo_content_briefs`, `seo_alerts`, `seo_fix_verification`

**Safe rollback possibility:** Yes if migration 5 (`20260801_seo_outreach.sql`) has not been
applied, since outreach campaigns reference `opportunity_id` values from `seo_opportunities`.
Also safe if no Google OAuth tokens have been stored (token rows contain sealed credentials;
dropping the table invalidates outstanding OAuth sessions).

**Data-loss risk:** All keyword/rank/competitor/opportunity/brief/alert/fix records are lost.
Google OAuth connections and their sealed tokens are lost — re-auth required for all users.
This is irreversible.

**Reversible vs irreversible:** Irreversible once rows exist (especially Google OAuth rows —
users must re-authorize). Structure is re-runnable via the migration file.

**Backup requirement:** Required before DROP if any rows exist. Pay special attention to
`seo_google_connections` — losing these forces full re-auth for all connected tenants.

**Recovery commands:**

```sql
-- Run ONLY after taking a backup. DESTROYS ALL DATA. Roll back migration 5 first.

DROP TABLE IF EXISTS "seo_fix_verification";
DROP TABLE IF EXISTS "seo_alerts";
DROP TABLE IF EXISTS "seo_content_briefs";
DROP TABLE IF EXISTS "seo_opportunities";
DROP TABLE IF EXISTS "seo_competitor_snapshots";
DROP TABLE IF EXISTS "seo_competitors";
DROP TABLE IF EXISTS "seo_rank_snapshots";
DROP TABLE IF EXISTS "seo_rank_jobs";
DROP TABLE IF EXISTS "seo_keyword_clusters";
DROP TABLE IF EXISTS "seo_keyword_metrics";
DROP TABLE IF EXISTS "seo_keywords";
DROP TABLE IF EXISTS "seo_keyword_projects";
DROP TABLE IF EXISTS "seo_analytics_landing_rows";
DROP TABLE IF EXISTS "seo_analytics_sync_jobs";
DROP TABLE IF EXISTS "seo_gsc_query_rows";
DROP TABLE IF EXISTS "seo_gsc_sync_jobs";
DROP TABLE IF EXISTS "seo_google_properties";
DROP TABLE IF EXISTS "seo_google_connections";
```

**Verification steps:**
```sql
SELECT COUNT(*) FROM information_schema.tables
WHERE table_name IN (
  'seo_google_connections','seo_google_properties','seo_gsc_sync_jobs','seo_gsc_query_rows',
  'seo_analytics_sync_jobs','seo_analytics_landing_rows','seo_keyword_projects','seo_keywords',
  'seo_keyword_metrics','seo_keyword_clusters','seo_rank_jobs','seo_rank_snapshots',
  'seo_competitors','seo_competitor_snapshots','seo_opportunities','seo_content_briefs',
  'seo_alerts','seo_fix_verification'
) AND table_schema = 'public';
-- Expected: 0
```

**Forward-fix strategy:** Google OAuth connection loss is particularly disruptive. If the issue
is a schema bug (not a complete feature rollback), prefer an ALTER-based forward fix over DROP.
Alternatively, export the `seo_google_connections` rows before dropping and restore manually.

---

## Migration 3 — `20260730_seo_backlinks.sql`

**Tables (4):** `seo_backlink_projects`, `seo_backlinks`, `seo_referring_domains`,
`seo_backlink_snapshots`

**Safe rollback possibility:** Yes — no other migration depends on these tables. The backlinks
vertical is self-contained.

**Data-loss risk:** All backlink records, referring domains, and velocity snapshots are lost.
Irreversible.

**Reversible vs irreversible:** Irreversible once rows exist. Structure is re-runnable.

**Backup requirement:** Required before DROP if any backlink data exists.

**Recovery commands:**

```sql
-- Run ONLY after taking a backup. DESTROYS ALL BACKLINK DATA.

-- Drop unique indexes first (Postgres drops them with the table, but explicit is clearer).
DROP INDEX IF EXISTS "uniq_seo_backlinks_dedup";
DROP INDEX IF EXISTS "uniq_seo_referring_domains_domain";

DROP TABLE IF EXISTS "seo_backlink_snapshots";
DROP TABLE IF EXISTS "seo_referring_domains";
DROP TABLE IF EXISTS "seo_backlinks";
DROP TABLE IF EXISTS "seo_backlink_projects";
```

**Verification steps:**
```sql
SELECT COUNT(*) FROM information_schema.tables
WHERE table_name IN (
  'seo_backlink_projects','seo_backlinks','seo_referring_domains','seo_backlink_snapshots'
) AND table_schema = 'public';
-- Expected: 0

SELECT COUNT(*) FROM pg_indexes
WHERE indexname IN ('uniq_seo_backlinks_dedup','uniq_seo_referring_domains_domain');
-- Expected: 0
```

**Forward-fix strategy:** If the dedup logic is wrong, a forward fix (recreating the unique
index after deduplicating existing rows) is safer than full rollback. Use `DELETE` with a CTE
to remove duplicate rows, then recreate the index.

---

## Migration 4 — `20260731_seo_local.sql`

**Tables (10):** `seo_locations`, `seo_gbp_connections`, `seo_gbp_reviews`, `seo_gbp_posts`,
`seo_citation_sources`, `seo_citations`, `seo_local_competitors`, `seo_local_rank_snapshots`,
`seo_nap_audits`, `seo_local_schema`

**Safe rollback possibility:** Yes — no other migration depends on these tables. The local
vertical is self-contained.

**Data-loss risk:** All location records (physical addresses), GBP OAuth connections (sealed
tokens — re-auth required), reviews, posts, citations, local rank snapshots, NAP audits, and
schema proposals are lost. Irreversible.

**Reversible vs irreversible:** Irreversible once rows exist. GBP OAuth connection loss
forces full re-auth. Structure is re-runnable.

**Backup requirement:** Required before DROP, especially for `seo_gbp_connections` (OAuth tokens)
and `seo_locations` (customer business addresses).

**Recovery commands:**

```sql
-- Policies must be dropped before tables in Postgres (they're dropped automatically
-- with DROP TABLE, but shown here for clarity). Run ONLY after taking a backup.

-- Drop policies explicitly (optional — DROP TABLE CASCADE handles it).
DROP POLICY IF EXISTS seo_local_schema_deny_all ON seo_local_schema;
DROP POLICY IF EXISTS seo_nap_audits_deny_all ON seo_nap_audits;
DROP POLICY IF EXISTS seo_local_rank_snapshots_deny_all ON seo_local_rank_snapshots;
DROP POLICY IF EXISTS seo_local_competitors_deny_all ON seo_local_competitors;
DROP POLICY IF EXISTS seo_citations_deny_all ON seo_citations;
DROP POLICY IF EXISTS seo_citation_sources_deny_all ON seo_citation_sources;
DROP POLICY IF EXISTS seo_gbp_posts_deny_all ON seo_gbp_posts;
DROP POLICY IF EXISTS seo_gbp_reviews_deny_all ON seo_gbp_reviews;
DROP POLICY IF EXISTS seo_gbp_connections_deny_all ON seo_gbp_connections;
DROP POLICY IF EXISTS seo_locations_deny_all ON seo_locations;

DROP TABLE IF EXISTS "seo_local_schema";
DROP TABLE IF EXISTS "seo_nap_audits";
DROP TABLE IF EXISTS "seo_local_rank_snapshots";
DROP TABLE IF EXISTS "seo_local_competitors";
DROP TABLE IF EXISTS "seo_citations";
DROP TABLE IF EXISTS "seo_citation_sources";
DROP TABLE IF EXISTS "seo_gbp_posts";
DROP TABLE IF EXISTS "seo_gbp_reviews";
DROP TABLE IF EXISTS "seo_gbp_connections";
DROP TABLE IF EXISTS "seo_locations";
```

**Verification steps:**
```sql
SELECT COUNT(*) FROM information_schema.tables
WHERE table_name IN (
  'seo_locations','seo_gbp_connections','seo_gbp_reviews','seo_gbp_posts',
  'seo_citation_sources','seo_citations','seo_local_competitors','seo_local_rank_snapshots',
  'seo_nap_audits','seo_local_schema'
) AND table_schema = 'public';
-- Expected: 0
```

**Forward-fix strategy:** GBP token loss is disruptive. If the issue is isolated to a single
table or policy, prefer surgical fixes. For example, if the deny-all policy is misconfigured,
fix the policy without dropping the table.

---

## Migration 5 — `20260801_seo_outreach.sql`

**Tables (6):** `seo_outreach_contacts`, `seo_outreach_campaigns`, `seo_outreach_drafts`,
`seo_outreach_followups`, `seo_link_placements`, `seo_outreach_suppression`

**Safe rollback possibility:** Yes — no other migration depends on these tables. Self-contained.

**Data-loss risk:** All outreach contacts, campaigns, email drafts, follow-up schedules, link
placement records, and suppression entries are lost. Loss of suppression entries is particularly
risky: removed suppressions could result in re-sending email to opted-out addresses. Irreversible.

**Reversible vs irreversible:** Irreversible once rows exist. Loss of `seo_outreach_suppression`
is a compliance risk — export this table before any rollback.

**Backup requirement:** Required before DROP. The suppression list (`seo_outreach_suppression`)
must be exported and preserved as a separate artefact to prevent emailing opted-out contacts.

**Recovery commands:**

```sql
-- EXPORT seo_outreach_suppression FIRST before running these commands.
-- Run ONLY after taking a backup. DESTROYS ALL OUTREACH DATA.

DROP INDEX IF EXISTS "uniq_seo_outreach_contacts_tenant_email";
DROP INDEX IF EXISTS "uniq_seo_outreach_suppression_tenant_email";

DROP TABLE IF EXISTS "seo_outreach_suppression";
DROP TABLE IF EXISTS "seo_link_placements";
DROP TABLE IF EXISTS "seo_outreach_followups";
DROP TABLE IF EXISTS "seo_outreach_drafts";
DROP TABLE IF EXISTS "seo_outreach_campaigns";
DROP TABLE IF EXISTS "seo_outreach_contacts";
```

**Verification steps:**
```sql
SELECT COUNT(*) FROM information_schema.tables
WHERE table_name IN (
  'seo_outreach_contacts','seo_outreach_campaigns','seo_outreach_drafts',
  'seo_outreach_followups','seo_link_placements','seo_outreach_suppression'
) AND table_schema = 'public';
-- Expected: 0
```

**Forward-fix strategy:** If the issue is with the email dedup uniqueness constraint (unique
partial index on email != ''), a forward fix is much safer: deduplicate the existing rows and
recreate the index. Never drop and recreate the suppression table without exporting it first.

---

## Migration 6 — `20260802_seo_reports.sql`

**Tables (1):** `seo_generated_reports`

**Safe rollback possibility:** Yes — no other migration or application component depends on this
table. The PDF bytes themselves are NOT stored in Supabase (they are in-process cache), so
dropping this table only loses the metadata records (report history, download tokens). PDF
re-generation is unaffected.

**Data-loss risk:** Report metadata (site_id, kind, date range, byte_size, sha256, expires_at)
is lost. Outstanding download tokens are invalidated. PDF bytes that were only cached in-process
are already transient. Loss is low-severity but irreversible.

**Reversible vs irreversible:** Reversible in practice — metadata can be regenerated by running
the PDF generation routes again. Structure is re-runnable via the migration file.

**Backup requirement:** Recommended but low-priority. No customer PII or tokens are stored here.

**Recovery commands:**

```sql
-- Run ONLY after taking a backup if report history matters.

DROP TABLE IF EXISTS "seo_generated_reports";
```

**Verification steps:**
```sql
SELECT COUNT(*) FROM information_schema.tables
WHERE table_name = 'seo_generated_reports'
AND table_schema = 'public';
-- Expected: 0
```

**Forward-fix strategy:** If the issue is with an index (e.g., the expires_at index is wrong),
drop and recreate only the index: `DROP INDEX IF EXISTS seo_generated_reports_expires; CREATE INDEX ...`.
Dropping the table is never necessary for an index-only fix.

---

## Post-Rollback Checklist (All Migrations)

1. Disable the application routes / workers that reference the dropped tables before executing
   DROP commands, or the application will log table-not-found errors during the window.
2. Confirm the backup is readable and restorable before running any DROP.
3. Run the verification SQL after each DROP to confirm the tables are gone.
4. Update the `.seo_migrations_applied.json` ledger (maintained by `backend/scripts/seo_migrate.py`)
   to remove the rolled-back migration entry.
5. Re-enable application components only after confirming the rollback is clean and the code
   deployment matching the rolled-back state is active.
