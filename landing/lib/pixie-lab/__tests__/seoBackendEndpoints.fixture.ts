/**
 * Canonical list of real backend endpoints under /api/agents/seo/*.
 *
 * SINGLE SOURCE OF TRUTH — extracted from:
 *   backend/seo/agent_routes.py          (Sites, Crawls, Pages, Issues, Reports, Audit)
 *   backend/seo/intelligence/routes.py   (Competitors, Opportunities, Optimise, Briefs, Alerts)
 *   backend/seo/keywords/project_routes.py (Keywords, Projects, Clusters, Research)
 *   backend/seo/rank/routes.py           (Rankings)
 *   backend/seo/google/routes.py         (Google/GSC/GA4)
 *   backend/seo/backlinks/routes.py      (Backlinks)
 *   backend/seo/local/routes.py          (Locations, GBP, Reviews, NAP, Citations, Local Rank, Competitors, Schema)
 *   backend/seo/outreach/routes.py       (Outreach contacts/campaigns/drafts/send/placements)
 *   backend/seo/scheduler/routes.py      (Scheduler admin)
 *   backend/seo/reporting/routes.py      (PDF reports)
 *   backend/seo/fix_verify_routes.py     (Fix verification)
 *
 * Do NOT duplicate this list elsewhere. Update here when backend routes change.
 *
 * Format: "METHOD /api/agents/seo/<path>"
 * Path params use {param} notation.
 */
export const KNOWN_BACKEND_ENDPOINTS: ReadonlySet<string> = new Set([
  // ── Sites ──────────────────────────────────────────────────────────────────
  'POST /api/agents/seo/sites',
  'GET /api/agents/seo/sites',
  'GET /api/agents/seo/sites/{site_id}',
  'PATCH /api/agents/seo/sites/{site_id}',
  'DELETE /api/agents/seo/sites/{site_id}',

  // ── Crawls ─────────────────────────────────────────────────────────────────
  'POST /api/agents/seo/crawl/start',
  'GET /api/agents/seo/crawls',
  'GET /api/agents/seo/crawl/{job_id}',
  'POST /api/agents/seo/crawl/{job_id}/cancel',
  'POST /api/agents/seo/crawl/{job_id}/retry',

  // ── Pages ──────────────────────────────────────────────────────────────────
  'GET /api/agents/seo/pages',

  // ── Issues ─────────────────────────────────────────────────────────────────
  'GET /api/agents/seo/issues',
  'POST /api/agents/seo/issues/{issue_id}/resolve',

  // ── Reports (crawl) ────────────────────────────────────────────────────────
  'GET /api/agents/seo/reports',
  'GET /api/agents/seo/report/{crawl_job_id}',

  // ── Audit ──────────────────────────────────────────────────────────────────
  'POST /api/agents/seo/audit/start',
  'GET /api/agents/seo/audit/{audit_id}',
  'GET /api/agents/seo/audit/{audit_id}/issues',
  'GET /api/agents/seo/audit/{audit_id}/pages',
  'POST /api/agents/seo/audit/{audit_id}/save-site',

  // ── Fix Verify ─────────────────────────────────────────────────────────────
  'POST /api/agents/seo/fix-verify/record',
  'POST /api/agents/seo/fix-verify/{fix_id}/verify',
  'GET /api/agents/seo/fix-verify',

  // ── Connections (legacy website platform) ──────────────────────────────────
  'GET /api/agents/seo/connections',
  'POST /api/agents/seo/connections',

  // ── Page Speed ─────────────────────────────────────────────────────────────
  'GET /api/agents/seo/pagespeed',

  // ── Keywords: Projects ─────────────────────────────────────────────────────
  'POST /api/agents/seo/keywords/projects',
  'GET /api/agents/seo/keywords/projects',
  'GET /api/agents/seo/keywords/projects/{project_id}',
  'PATCH /api/agents/seo/keywords/projects/{project_id}',
  'POST /api/agents/seo/keywords/projects/{project_id}/archive',

  // ── Keywords: Keywords ─────────────────────────────────────────────────────
  'POST /api/agents/seo/keywords/projects/{project_id}/keywords',
  'POST /api/agents/seo/keywords/projects/{project_id}/keywords/bulk',
  'GET /api/agents/seo/keywords/projects/{project_id}/keywords',
  'GET /api/agents/seo/keywords/projects/{project_id}/keywords/{keyword_id}',
  'PATCH /api/agents/seo/keywords/projects/{project_id}/keywords/{keyword_id}',
  'DELETE /api/agents/seo/keywords/projects/{project_id}/keywords/{keyword_id}',
  'POST /api/agents/seo/keywords/projects/{project_id}/keywords/{keyword_id}/track',

  // ── Keywords: CSV ──────────────────────────────────────────────────────────
  'POST /api/agents/seo/keywords/projects/{project_id}/keywords/import',
  'GET /api/agents/seo/keywords/projects/{project_id}/keywords/export',

  // ── Keywords: Research ─────────────────────────────────────────────────────
  'POST /api/agents/seo/keywords/research',

  // ── Keywords: Clusters ─────────────────────────────────────────────────────
  'POST /api/agents/seo/keywords/projects/{project_id}/clusters/auto',
  'GET /api/agents/seo/keywords/projects/{project_id}/clusters',
  'GET /api/agents/seo/keywords/projects/{project_id}/clusters/{cluster_id}',
  'PATCH /api/agents/seo/keywords/projects/{project_id}/clusters/{cluster_id}',
  'POST /api/agents/seo/keywords/projects/{project_id}/clusters/merge',
  'POST /api/agents/seo/keywords/projects/{project_id}/clusters/{cluster_id}/split',

  // ── Keywords: Intent ───────────────────────────────────────────────────────
  'POST /api/agents/seo/keywords/intent/classify',

  // ── Rankings ───────────────────────────────────────────────────────────────
  'POST /api/agents/seo/rank/check',
  'GET /api/agents/seo/rank/jobs',
  'GET /api/agents/seo/rank/job/{job_id}',
  'GET /api/agents/seo/rank/history',
  'GET /api/agents/seo/rank/overview',
  'GET /api/agents/seo/rank/keyword/{keyword_id}',

  // ── Intelligence: Competitors ──────────────────────────────────────────────
  'POST /api/agents/seo/competitors',
  'GET /api/agents/seo/competitors',
  'GET /api/agents/seo/competitors/gap',
  'GET /api/agents/seo/competitors/{competitor_id}',
  'PATCH /api/agents/seo/competitors/{competitor_id}',
  'DELETE /api/agents/seo/competitors/{competitor_id}',
  'POST /api/agents/seo/competitors/{competitor_id}/snapshot',

  // ── Intelligence: Opportunities ────────────────────────────────────────────
  'POST /api/agents/seo/opportunities/generate',
  'GET /api/agents/seo/opportunities',
  'GET /api/agents/seo/opportunities/{opp_id}',
  'POST /api/agents/seo/opportunities/{opp_id}/dismiss',
  'POST /api/agents/seo/opportunities/{opp_id}/action',
  'POST /api/agents/seo/opportunities/{opp_id}/explain',

  // ── Intelligence: Optimise ─────────────────────────────────────────────────
  'GET /api/agents/seo/optimise',
  'POST /api/agents/seo/optimise/ai',

  // ── Intelligence: Briefs ───────────────────────────────────────────────────
  'POST /api/agents/seo/briefs/generate',
  'GET /api/agents/seo/briefs',
  'GET /api/agents/seo/briefs/{brief_id}',
  'PATCH /api/agents/seo/briefs/{brief_id}',
  'POST /api/agents/seo/briefs/{brief_id}/approve',
  'POST /api/agents/seo/briefs/{brief_id}/archive',
  'POST /api/agents/seo/briefs/{brief_id}/duplicate',
  'GET /api/agents/seo/briefs/{brief_id}/export',
  'POST /api/agents/seo/briefs/{brief_id}/handoff',

  // ── Intelligence: Alerts ───────────────────────────────────────────────────
  'POST /api/agents/seo/alerts/generate',
  'GET /api/agents/seo/alerts',
  'POST /api/agents/seo/alerts/{alert_id}/read',
  'POST /api/agents/seo/alerts/{alert_id}/dismiss',

  // ── Google / GSC / GA4 ────────────────────────────────────────────────────
  'GET /api/agents/seo/google/connections',
  'POST /api/agents/seo/google/connect',
  'GET /api/agents/seo/google/callback',
  'GET /api/agents/seo/google/properties',
  'POST /api/agents/seo/google/properties/select',
  'POST /api/agents/seo/google/connections/{connection_id}/sync',
  'POST /api/agents/seo/google/connections/{connection_id}/disconnect',
  'GET /api/agents/seo/google/gsc/queries',
  'GET /api/agents/seo/google/gsc/pages',
  'GET /api/agents/seo/google/ga4/landing',

  // ── Backlinks ──────────────────────────────────────────────────────────────
  'POST /api/agents/seo/backlinks/sync',
  'GET /api/agents/seo/backlinks/overview',
  'GET /api/agents/seo/backlinks',
  'GET /api/agents/seo/backlinks/referring-domains',
  'GET /api/agents/seo/backlinks/new-lost',
  'GET /api/agents/seo/backlinks/anchors',
  'GET /api/agents/seo/backlinks/velocity',
  'GET /api/agents/seo/backlinks/risk',
  'GET /api/agents/seo/backlinks/gap',
  'GET /api/agents/seo/backlinks/opportunities',
  'GET /api/agents/seo/backlinks/export',

  // ── Local: Locations ──────────────────────────────────────────────────────
  'POST /api/agents/seo/locations',
  'GET /api/agents/seo/locations',
  'GET /api/agents/seo/locations/{location_id}',
  'PATCH /api/agents/seo/locations/{location_id}',
  'POST /api/agents/seo/locations/{location_id}/archive',
  'POST /api/agents/seo/locations/{location_id}/restore',
  'DELETE /api/agents/seo/locations/{location_id}',

  // ── Local: GBP OAuth ──────────────────────────────────────────────────────
  'GET /api/agents/seo/gbp/connect',
  'POST /api/agents/seo/gbp/callback',
  'GET /api/agents/seo/gbp/connections',
  'GET /api/agents/seo/gbp/connections/{connection_id}/accounts',
  'GET /api/agents/seo/gbp/connections/{connection_id}/accounts/{account_name}/locations',
  'POST /api/agents/seo/gbp/map-location',
  'POST /api/agents/seo/gbp/sync',
  'POST /api/agents/seo/gbp/connections/{connection_id}/refresh',
  'DELETE /api/agents/seo/gbp/connections/{connection_id}',

  // ── Local: Reviews ────────────────────────────────────────────────────────
  'GET /api/agents/seo/locations/{location_id}/reviews',
  'POST /api/agents/seo/locations/{location_id}/reviews/ingest',
  'POST /api/agents/seo/reviews/{review_id}/draft',
  'PATCH /api/agents/seo/reviews/{review_id}/draft',
  'POST /api/agents/seo/reviews/{review_id}/approve',
  'POST /api/agents/seo/reviews/{review_id}/handled',
  'POST /api/agents/seo/reviews/{review_id}/assign',

  // ── Local: NAP Audit ──────────────────────────────────────────────────────
  'POST /api/agents/seo/locations/{location_id}/nap/audit',
  'GET /api/agents/seo/locations/{location_id}/nap',
  'POST /api/agents/seo/nap/{audit_id}/confirm-variant',

  // ── Local: Citations ──────────────────────────────────────────────────────
  'GET /api/agents/seo/locations/{location_id}/citations',
  'POST /api/agents/seo/locations/{location_id}/citations',
  'DELETE /api/agents/seo/citations/{citation_id}',
  'GET /api/agents/seo/locations/{location_id}/citations/export',
  'POST /api/agents/seo/locations/{location_id}/citations/import',
  'POST /api/agents/seo/citations/{citation_id}/check',
  'POST /api/agents/seo/locations/{location_id}/citations/check-all',

  // ── Local: Local Rank ─────────────────────────────────────────────────────
  'POST /api/agents/seo/local-rank/check',
  'GET /api/agents/seo/locations/{location_id}/local-rank/overview',
  'GET /api/agents/seo/locations/{location_id}/local-rank/winners-losers',
  'GET /api/agents/seo/locations/{location_id}/local-rank/pack-visibility',

  // ── Local: Local Competitors ──────────────────────────────────────────────
  'GET /api/agents/seo/locations/{location_id}/competitors',
  'POST /api/agents/seo/locations/{location_id}/competitors',
  'DELETE /api/agents/seo/competitors/{comp_id}',
  'GET /api/agents/seo/locations/{location_id}/opportunities',
  'GET /api/agents/seo/locations/{location_id}/competitors/rank/{keyword}',

  // ── Local: Location Pages ─────────────────────────────────────────────────
  'GET /api/agents/seo/locations/{location_id}/page-opportunities',
  'POST /api/agents/seo/location-pages/handoff',

  // ── Local: Schema ─────────────────────────────────────────────────────────
  'POST /api/agents/seo/locations/{location_id}/schema/propose',
  'GET /api/agents/seo/locations/{location_id}/schema',
  'POST /api/agents/seo/schema/{schema_id}/approve',
  'POST /api/agents/seo/schema/{schema_id}/published',
  'GET /api/agents/seo/locations/{location_id}/schema/audit',

  // ── Outreach: Contacts ────────────────────────────────────────────────────
  'POST /api/agents/seo/outreach/contacts',
  'GET /api/agents/seo/outreach/contacts',
  'GET /api/agents/seo/outreach/contacts/{contact_id}',
  'PATCH /api/agents/seo/outreach/contacts/{contact_id}',
  'DELETE /api/agents/seo/outreach/contacts/{contact_id}',
  'POST /api/agents/seo/outreach/contacts/import',
  'GET /api/agents/seo/outreach/contacts/export/csv',
  'POST /api/agents/seo/outreach/suppress',
  'GET /api/agents/seo/outreach/suppression',

  // ── Outreach: Campaigns ───────────────────────────────────────────────────
  'POST /api/agents/seo/outreach/campaigns',
  'GET /api/agents/seo/outreach/campaigns',
  'GET /api/agents/seo/outreach/campaigns/{campaign_id}',
  'PATCH /api/agents/seo/outreach/campaigns/{campaign_id}',
  'POST /api/agents/seo/outreach/campaigns/{campaign_id}/transition',
  'POST /api/agents/seo/outreach/campaigns/{campaign_id}/approve',
  'POST /api/agents/seo/outreach/campaigns/{campaign_id}/contacts',
  'DELETE /api/agents/seo/outreach/campaigns/{campaign_id}',

  // ── Outreach: Drafts ──────────────────────────────────────────────────────
  'POST /api/agents/seo/outreach/drafts/generate',
  'GET /api/agents/seo/outreach/drafts',
  'GET /api/agents/seo/outreach/drafts/{draft_id}',
  'PATCH /api/agents/seo/outreach/drafts/{draft_id}',
  'POST /api/agents/seo/outreach/drafts/{draft_id}/approve',

  // ── Outreach: Send ────────────────────────────────────────────────────────
  'POST /api/agents/seo/outreach/send',

  // ── Outreach: Follow-ups ──────────────────────────────────────────────────
  'POST /api/agents/seo/outreach/followups/schedule',
  'POST /api/agents/seo/outreach/followups/run',
  'GET /api/agents/seo/outreach/followups',
  'POST /api/agents/seo/outreach/followups/{followup_id}/stop',

  // ── Outreach: Placements ──────────────────────────────────────────────────
  'POST /api/agents/seo/outreach/placements',
  'GET /api/agents/seo/outreach/placements',
  'PATCH /api/agents/seo/outreach/placements/{placement_id}',
  'POST /api/agents/seo/outreach/placements/{placement_id}/verify',

  // ── Scheduler ─────────────────────────────────────────────────────────────
  'GET /api/agents/seo/scheduler/health',
  'POST /api/agents/seo/scheduler/tick',
  'POST /api/agents/seo/scheduler/jobs/{job_id}/retry',
  'POST /api/agents/seo/scheduler/pause',
  'POST /api/agents/seo/scheduler/resume',

  // ── PDF Reports ───────────────────────────────────────────────────────────
  'POST /api/agents/seo/reports/pdf',
  'GET /api/agents/seo/reports/pdf',
  'GET /api/agents/seo/reports/pdf/{report_id}/download',
]);

/**
 * Normalise a backend path to a pattern key for Set lookup.
 * Replaces path segments that look like IDs/UUIDs with {param}.
 *
 * Examples:
 *   "/api/agents/seo/sites/abc-123"  → "/api/agents/seo/sites/{site_id}"
 *   "/api/agents/seo/crawl/job-x"    → "/api/agents/seo/crawl/{job_id}"
 *
 * For contract tests we check the static prefix (no dynamic segment)
 * and accept that the fixture uses {param} placeholders.
 */
export function normaliseBackendPath(path: string): string {
  // Strip query string
  const clean = path.split('?')[0];
  // Collapse any path segment that isn't a known keyword into {param}
  const STATIC_PREFIXES = new Set([
    'api', 'agents', 'seo', 'sites', 'crawl', 'crawls', 'pages', 'issues',
    'reports', 'report', 'audit', 'fix-verify', 'connections', 'pagespeed',
    'keywords', 'projects', 'clusters', 'auto', 'bulk', 'import', 'export',
    'research', 'intent', 'classify', 'track', 'merge', 'split',
    'rank', 'jobs', 'history', 'overview', 'competitors', 'gap', 'snapshot',
    'opportunities', 'generate', 'dismiss', 'action', 'explain',
    'optimise', 'ai', 'briefs', 'approve', 'archive', 'duplicate', 'handoff',
    'alerts', 'read',
    'google', 'callback', 'properties', 'select', 'sync', 'disconnect',
    'gsc', 'ga4', 'queries', 'landing',
    'backlinks', 'overview', 'referring-domains', 'new-lost', 'anchors',
    'velocity', 'risk', 'opportunities', 'download',
    'locations', 'archive', 'restore', 'gbp', 'connect', 'accounts',
    'reviews', 'ingest', 'handled', 'assign', 'draft',
    'nap', 'confirm-variant', 'citations', 'check', 'check-all',
    'local-rank', 'winners-losers', 'pack-visibility',
    'schema', 'propose', 'published',
    'outreach', 'contacts', 'suppress', 'suppression', 'campaigns',
    'transition', 'drafts', 'send', 'followups', 'schedule', 'run',
    'stop', 'placements', 'verify',
    'scheduler', 'tick', 'pause', 'resume',
    'pdf', 'location-pages',
    'competitor', 'page-opportunities',
    'map-location', 'refresh', 'cancel', 'retry', 'start', 'save-site',
    'fix-verify', 'record',
  ]);

  return '/' + clean.split('/').filter(Boolean).map(seg => {
    if (STATIC_PREFIXES.has(seg)) return seg;
    // Looks like an ID (contains - or is alphanumeric uuid-like)
    return '{param}';
  }).join('/');
}