/**
 * SEO Route Contract Tests
 *
 * Asserts that every proxy route under /api/lab/seo/* correctly targets a known
 * backend endpoint under /api/agents/seo/*.
 *
 * Rules enforced:
 *  1. Every static backend path used by a proxy is present in KNOWN_BACKEND_ENDPOINTS.
 *  2. Every proxy URL lives under /api/lab/seo/.
 *  3. HTTP methods are consistent with the backend contract.
 *
 * Tenant isolation is NOT tested here (that is a server-side concern tested by
 * integration / E2E tests). We validate paths and methods only.
 *
 * Usage:  cd landing && npx vitest run lib/pixie-lab/__tests__/seoRouteContract.test.ts
 */

import { describe, it, expect } from 'vitest';
import { KNOWN_BACKEND_ENDPOINTS } from './seoBackendEndpoints.fixture';

// ─────────────────────────────────────────────────────────────────────────────
// Contract table
// Each row describes one proxy → backend mapping.
// method   : HTTP method the PROXY uses to reach the backend
// proxy    : Next.js route path (what the browser calls), relative to /api/lab/seo
// backend  : Backend path the proxy forwards to (static placeholder form)
// note     : optional free-text reason for unusual cases
// ─────────────────────────────────────────────────────────────────────────────
interface ContractRow {
  method: string;
  proxy: string;
  backend: string;
  note?: string;
}

const CONTRACT: ContractRow[] = [
  // ── Sites ────────────────────────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/sites',                backend: 'GET /api/agents/seo/sites' },
  { method: 'POST',   proxy: '/api/lab/seo/sites',                backend: 'POST /api/agents/seo/sites' },
  { method: 'GET',    proxy: '/api/lab/seo/sites/{siteId}',       backend: 'GET /api/agents/seo/sites/{site_id}' },
  { method: 'PATCH',  proxy: '/api/lab/seo/sites/{siteId}',       backend: 'PATCH /api/agents/seo/sites/{site_id}' },
  { method: 'DELETE', proxy: '/api/lab/seo/sites/{siteId}',       backend: 'DELETE /api/agents/seo/sites/{site_id}' },

  // ── Crawls ───────────────────────────────────────────────────────────────
  { method: 'POST',   proxy: '/api/lab/seo/crawl',                backend: 'POST /api/agents/seo/crawl/start' },
  { method: 'GET',    proxy: '/api/lab/seo/crawl',                backend: 'GET /api/agents/seo/crawls' },
  { method: 'GET',    proxy: '/api/lab/seo/crawl/{jobId}',        backend: 'GET /api/agents/seo/crawl/{job_id}' },
  { method: 'POST',   proxy: '/api/lab/seo/crawl/{jobId}',        backend: 'POST /api/agents/seo/crawl/{job_id}/cancel',
    note: 'cancel action dispatched via action param' },

  // ── Pages ─────────────────────────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/pages',                backend: 'GET /api/agents/seo/pages' },

  // ── Issues ────────────────────────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/issues',               backend: 'GET /api/agents/seo/issues' },
  { method: 'POST',   proxy: '/api/lab/seo/issues/{issueId}',     backend: 'POST /api/agents/seo/issues/{issue_id}/resolve' },

  // ── Crawl Reports ─────────────────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/reports',              backend: 'GET /api/agents/seo/reports' },

  // ── Audit ─────────────────────────────────────────────────────────────────
  { method: 'POST',   proxy: '/api/lab/seo/audit',                backend: 'POST /api/agents/seo/audit/start' },
  { method: 'GET',    proxy: '/api/lab/seo/audit',                backend: 'GET /api/agents/seo/audit/{audit_id}',
    note: 'audit_id passed as ?audit_id= query param' },

  // ── Keywords: Projects ────────────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/keywords/projects',    backend: 'GET /api/agents/seo/keywords/projects' },
  { method: 'POST',   proxy: '/api/lab/seo/keywords/projects',    backend: 'POST /api/agents/seo/keywords/projects' },

  // ── Keywords ──────────────────────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/keywords',             backend: 'GET /api/agents/seo/keywords/projects/{project_id}/keywords' },
  { method: 'POST',   proxy: '/api/lab/seo/keywords',             backend: 'POST /api/agents/seo/keywords/projects/{project_id}/keywords' },

  // ── Keywords: Research ────────────────────────────────────────────────────
  { method: 'POST',   proxy: '/api/lab/seo/keywords/research',    backend: 'POST /api/agents/seo/keywords/research' },

  // ── Keywords: Import / Export ─────────────────────────────────────────────
  { method: 'POST',   proxy: '/api/lab/seo/keywords/import',      backend: 'POST /api/agents/seo/keywords/projects/{project_id}/keywords/import' },
  { method: 'GET',    proxy: '/api/lab/seo/keywords/export',      backend: 'GET /api/agents/seo/keywords/projects/{project_id}/keywords/export' },

  // ── Keywords: Clusters ────────────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/keywords/clusters',    backend: 'GET /api/agents/seo/keywords/projects/{project_id}/clusters',
    note: 'project_id passed as ?project_id=' },
  { method: 'POST',   proxy: '/api/lab/seo/keywords/projects/{project_id}/clusters', backend: 'POST /api/agents/seo/keywords/projects/{project_id}/clusters/auto' },

  // ── Rankings ─────────────────────────────────────────────────────────────
  { method: 'POST',   proxy: '/api/lab/seo/rankings/check',       backend: 'POST /api/agents/seo/rank/check' },
  { method: 'GET',    proxy: '/api/lab/seo/rankings/jobs',        backend: 'GET /api/agents/seo/rank/jobs' },
  { method: 'GET',    proxy: '/api/lab/seo/rankings/history',     backend: 'GET /api/agents/seo/rank/history' },
  { method: 'GET',    proxy: '/api/lab/seo/rankings/overview',    backend: 'GET /api/agents/seo/rank/overview' },
  { method: 'GET',    proxy: '/api/lab/seo/rankings/keyword/{id}', backend: 'GET /api/agents/seo/rank/keyword/{keyword_id}' },

  // ── Intelligence: Competitors ─────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/competitors',          backend: 'GET /api/agents/seo/competitors' },
  { method: 'POST',   proxy: '/api/lab/seo/competitors',          backend: 'POST /api/agents/seo/competitors' },
  { method: 'GET',    proxy: '/api/lab/seo/competitors/gap',      backend: 'GET /api/agents/seo/competitors/gap' },
  { method: 'POST',   proxy: '/api/lab/seo/competitors/gap',      backend: 'GET /api/agents/seo/competitors/gap',
    note: 'proxy converts POST body to GET query params for read-only gap analysis' },

  // ── Intelligence: Opportunities ───────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/opportunities',        backend: 'GET /api/agents/seo/opportunities' },
  { method: 'POST',   proxy: '/api/lab/seo/opportunities/generate', backend: 'POST /api/agents/seo/opportunities/generate' },
  { method: 'POST',   proxy: '/api/lab/seo/opportunities/{id}/dismiss', backend: 'POST /api/agents/seo/opportunities/{opp_id}/dismiss' },
  { method: 'POST',   proxy: '/api/lab/seo/opportunities/{id}/action',  backend: 'POST /api/agents/seo/opportunities/{opp_id}/action' },

  // ── Intelligence: Optimise ────────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/optimise',             backend: 'GET /api/agents/seo/optimise' },

  // ── Intelligence: Briefs ──────────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/briefs',               backend: 'GET /api/agents/seo/briefs' },
  { method: 'POST',   proxy: '/api/lab/seo/briefs',               backend: 'POST /api/agents/seo/briefs/generate',
    note: 'proxy /briefs POST calls /briefs/generate on backend' },
  { method: 'POST',   proxy: '/api/lab/seo/briefs/generate',      backend: 'POST /api/agents/seo/briefs/generate' },
  { method: 'POST',   proxy: '/api/lab/seo/briefs/{id}/approve',  backend: 'POST /api/agents/seo/briefs/{brief_id}/approve' },
  { method: 'POST',   proxy: '/api/lab/seo/briefs/{id}/archive',  backend: 'POST /api/agents/seo/briefs/{brief_id}/archive' },
  { method: 'POST',   proxy: '/api/lab/seo/briefs/{id}/duplicate', backend: 'POST /api/agents/seo/briefs/{brief_id}/duplicate' },
  { method: 'POST',   proxy: '/api/lab/seo/briefs/{id}/handoff',  backend: 'POST /api/agents/seo/briefs/{brief_id}/handoff' },

  // ── Intelligence: Alerts ──────────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/alerts',               backend: 'GET /api/agents/seo/alerts' },
  { method: 'POST',   proxy: '/api/lab/seo/alerts/generate',      backend: 'POST /api/agents/seo/alerts/generate' },
  { method: 'POST',   proxy: '/api/lab/seo/alerts/{id}/read',     backend: 'POST /api/agents/seo/alerts/{alert_id}/read' },
  { method: 'POST',   proxy: '/api/lab/seo/alerts/{id}/dismiss',  backend: 'POST /api/agents/seo/alerts/{alert_id}/dismiss' },

  // ── Google / GSC / GA4 ────────────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/google/connections',   backend: 'GET /api/agents/seo/google/connections' },
  { method: 'POST',   proxy: '/api/lab/seo/google/connect',       backend: 'POST /api/agents/seo/google/connect' },
  { method: 'GET',    proxy: '/api/lab/seo/google/properties',    backend: 'GET /api/agents/seo/google/properties' },
  { method: 'POST',   proxy: '/api/lab/seo/google/properties/select', backend: 'POST /api/agents/seo/google/properties/select' },
  { method: 'POST',   proxy: '/api/lab/seo/google/connections/{id}/sync',       backend: 'POST /api/agents/seo/google/connections/{connection_id}/sync' },
  { method: 'POST',   proxy: '/api/lab/seo/google/connections/{id}/disconnect', backend: 'POST /api/agents/seo/google/connections/{connection_id}/disconnect' },

  // ── Backlinks ─────────────────────────────────────────────────────────────
  { method: 'POST',   proxy: '/api/lab/seo/backlinks/sync',       backend: 'POST /api/agents/seo/backlinks/sync' },
  { method: 'GET',    proxy: '/api/lab/seo/backlinks/overview',   backend: 'GET /api/agents/seo/backlinks/overview' },
  { method: 'GET',    proxy: '/api/lab/seo/backlinks',            backend: 'GET /api/agents/seo/backlinks' },
  { method: 'GET',    proxy: '/api/lab/seo/backlinks/referring-domains', backend: 'GET /api/agents/seo/backlinks/referring-domains' },
  { method: 'GET',    proxy: '/api/lab/seo/backlinks/new-lost',   backend: 'GET /api/agents/seo/backlinks/new-lost' },
  { method: 'GET',    proxy: '/api/lab/seo/backlinks/anchors',    backend: 'GET /api/agents/seo/backlinks/anchors' },
  { method: 'GET',    proxy: '/api/lab/seo/backlinks/risk',       backend: 'GET /api/agents/seo/backlinks/risk' },
  { method: 'POST',   proxy: '/api/lab/seo/backlinks/gap',        backend: 'GET /api/agents/seo/backlinks/gap',
    note: 'proxy converts POST body to GET query params (backend is read-only GET)' },
  { method: 'GET',    proxy: '/api/lab/seo/backlinks/opportunities', backend: 'GET /api/agents/seo/backlinks/opportunities' },
  { method: 'GET',    proxy: '/api/lab/seo/backlinks/export',     backend: 'GET /api/agents/seo/backlinks/export' },

  // ── Local: Locations ─────────────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/local',                backend: 'GET /api/agents/seo/locations',
    note: 'legacy /local proxy is a view of /locations' },
  { method: 'GET',    proxy: '/api/lab/seo/locations',            backend: 'GET /api/agents/seo/locations' },
  { method: 'POST',   proxy: '/api/lab/seo/locations',            backend: 'POST /api/agents/seo/locations' },
  { method: 'GET',    proxy: '/api/lab/seo/locations/{id}',       backend: 'GET /api/agents/seo/locations/{location_id}' },
  { method: 'PATCH',  proxy: '/api/lab/seo/locations/{id}',       backend: 'PATCH /api/agents/seo/locations/{location_id}' },
  { method: 'DELETE', proxy: '/api/lab/seo/locations/{id}',       backend: 'DELETE /api/agents/seo/locations/{location_id}' },

  // ── Local: Reviews ────────────────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/reviews',              backend: 'GET /api/agents/seo/locations/{location_id}/reviews',
    note: 'location_id required as ?location_id=' },
  { method: 'POST',   proxy: '/api/lab/seo/reviews',              backend: 'POST /api/agents/seo/reviews/{review_id}/draft',
    note: 'or /approve or /handled — dispatched by action field' },

  // ── Local: Citations ──────────────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/citations',            backend: 'GET /api/agents/seo/locations/{location_id}/citations',
    note: 'location_id required as ?location_id=' },
  { method: 'POST',   proxy: '/api/lab/seo/citations',            backend: 'POST /api/agents/seo/locations/{location_id}/citations',
    note: 'or check-all — dispatched by action field' },
  { method: 'GET',    proxy: '/api/lab/seo/citations/export',     backend: 'GET /api/agents/seo/locations/{location_id}/citations/export',
    note: 'location_id required as ?location_id=' },

  // ── Local: Local Rank ─────────────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/local-rank',           backend: 'GET /api/agents/seo/locations/{location_id}/local-rank/overview',
    note: 'location_id required as ?location_id=' },
  { method: 'POST',   proxy: '/api/lab/seo/local-rank',           backend: 'POST /api/agents/seo/local-rank/check' },

  // ── Local: GBP ────────────────────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/gbp/connect',          backend: 'GET /api/agents/seo/gbp/connect' },
  { method: 'POST',   proxy: '/api/lab/seo/gbp/callback',         backend: 'POST /api/agents/seo/gbp/callback' },
  { method: 'GET',    proxy: '/api/lab/seo/gbp/connections',      backend: 'GET /api/agents/seo/gbp/connections' },
  { method: 'GET',    proxy: '/api/lab/seo/gbp/connections/{id}/accounts', backend: 'GET /api/agents/seo/gbp/connections/{connection_id}/accounts',
    note: 'also lists that account\'s locations via ?account= (backend :path segment)' },
  { method: 'POST',   proxy: '/api/lab/seo/gbp/connections/{id}', backend: 'POST /api/agents/seo/gbp/connections/{connection_id}/refresh',
    note: 'refresh access token' },
  { method: 'DELETE', proxy: '/api/lab/seo/gbp/connections/{id}', backend: 'DELETE /api/agents/seo/gbp/connections/{connection_id}' },
  { method: 'POST',   proxy: '/api/lab/seo/gbp/map-location',     backend: 'POST /api/agents/seo/gbp/map-location' },
  { method: 'POST',   proxy: '/api/lab/seo/gbp/sync',            backend: 'POST /api/agents/seo/gbp/sync' },

  // ── Local: NAP Audit ──────────────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/nap',                  backend: 'GET /api/agents/seo/locations/{location_id}/nap',
    note: 'location_id required as ?location_id=' },
  { method: 'POST',   proxy: '/api/lab/seo/nap',                  backend: 'POST /api/agents/seo/locations/{location_id}/nap/audit',
    note: 'default action=audit; action=confirm_variant → POST /nap/{audit_id}/confirm-variant' },

  // ── Local: Schema ─────────────────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/schema',               backend: 'GET /api/agents/seo/locations/{location_id}/schema',
    note: 'location_id required; ?view=audit → /schema/audit' },
  { method: 'POST',   proxy: '/api/lab/seo/schema',               backend: 'POST /api/agents/seo/locations/{location_id}/schema/propose',
    note: 'default action=propose; approve→/schema/{id}/approve, published→/schema/{id}/published' },

  // ── Local: Local Competitors ──────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/local-competitors',    backend: 'GET /api/agents/seo/locations/{location_id}/competitors',
    note: 'location_id required; ?view=opportunities → /opportunities' },
  { method: 'POST',   proxy: '/api/lab/seo/local-competitors',    backend: 'POST /api/agents/seo/locations/{location_id}/competitors' },
  { method: 'DELETE', proxy: '/api/lab/seo/local-competitors',    backend: 'DELETE /api/agents/seo/competitors/{comp_id}',
    note: 'comp_id required as ?comp_id=' },

  // ── Local: Location Pages ─────────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/location-pages',       backend: 'GET /api/agents/seo/locations/{location_id}/page-opportunities',
    note: 'location_id required as ?location_id=' },
  { method: 'POST',   proxy: '/api/lab/seo/location-pages',       backend: 'POST /api/agents/seo/location-pages/handoff',
    note: 'action=handoff — billed as a separate Content operation' },

  // ── Outreach: Contacts ────────────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/outreach/contacts',    backend: 'GET /api/agents/seo/outreach/contacts' },
  { method: 'POST',   proxy: '/api/lab/seo/outreach/contacts',    backend: 'POST /api/agents/seo/outreach/contacts',
    note: 'or /suppress dispatched by action field' },
  { method: 'GET',    proxy: '/api/lab/seo/outreach/contacts/export', backend: 'GET /api/agents/seo/outreach/contacts/export/csv' },

  // ── Outreach: Campaigns ───────────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/outreach/campaigns',   backend: 'GET /api/agents/seo/outreach/campaigns' },
  { method: 'POST',   proxy: '/api/lab/seo/outreach/campaigns',   backend: 'POST /api/agents/seo/outreach/campaigns',
    note: 'or PATCH /campaigns/{id} dispatched by action field' },

  // ── Outreach: Drafts ──────────────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/outreach/drafts',      backend: 'GET /api/agents/seo/outreach/drafts' },
  { method: 'POST',   proxy: '/api/lab/seo/outreach/drafts',      backend: 'POST /api/agents/seo/outreach/drafts/generate',
    note: 'or /drafts/{id}/approve dispatched by action field' },

  // ── Outreach: Send ────────────────────────────────────────────────────────
  { method: 'POST',   proxy: '/api/lab/seo/outreach/send',        backend: 'POST /api/agents/seo/outreach/send' },

  // ── Outreach: Placements ──────────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/outreach/placements',  backend: 'GET /api/agents/seo/outreach/placements' },
  { method: 'POST',   proxy: '/api/lab/seo/outreach/placements',  backend: 'POST /api/agents/seo/outreach/placements' },

  // ── Scheduler ─────────────────────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/scheduler/health',     backend: 'GET /api/agents/seo/scheduler/health' },
  { method: 'POST',   proxy: '/api/lab/seo/scheduler/tick',       backend: 'POST /api/agents/seo/scheduler/tick' },
  { method: 'POST',   proxy: '/api/lab/seo/scheduler/retry',      backend: 'POST /api/agents/seo/scheduler/jobs/{job_id}/retry',
    note: 'job_id moved from body to path segment in proxy' },
  { method: 'POST',   proxy: '/api/lab/seo/scheduler/pause',      backend: 'POST /api/agents/seo/scheduler/pause' },
  { method: 'POST',   proxy: '/api/lab/seo/scheduler/resume',     backend: 'POST /api/agents/seo/scheduler/resume' },

  // ── PDF Reports ───────────────────────────────────────────────────────────
  { method: 'POST',   proxy: '/api/lab/seo/reports/pdf',          backend: 'POST /api/agents/seo/reports/pdf' },
  { method: 'GET',    proxy: '/api/lab/seo/reports/pdf',          backend: 'GET /api/agents/seo/reports/pdf' },

  // ── Page Speed ────────────────────────────────────────────────────────────
  { method: 'GET',    proxy: '/api/lab/seo/pagespeed',            backend: 'GET /api/agents/seo/pagespeed' },
];

// ─────────────────────────────────────────────────────────────────────────────
// DEPRECATED / LEGACY PROXY ROUTES
// These proxies exist but do not have a direct backend counterpart, either
// because they are internal wrappers or because the backend endpoint was
// renamed/removed. Listed here for documentation; NOT asserted against
// KNOWN_BACKEND_ENDPOINTS.
// ─────────────────────────────────────────────────────────────────────────────
const DEPRECATED_OR_INTERNAL: Array<{ proxy: string; reason: string }> = [
  {
    proxy: '/api/lab/seo/connections',
    reason: 'Legacy website-platform connector. Backend has /connections but uses a different auth model; this proxy is internal only.',
  },
  {
    proxy: '/api/lab/seo/integrations',
    reason: 'Aggregator/status view — fetches from multiple backend endpoints; not a 1:1 map.',
  },
  {
    proxy: '/api/lab/seo/history',
    reason: 'Fetches /history which is not in the current backend OpenAPI surface; treat as internal.',
  },
  {
    proxy: '/api/lab/seo/optimize',
    reason: 'American-spelling alias for /optimise. Forwards internally; the canonical proxy is /optimise.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('SEO Route Contract', () => {
  describe('proxy paths start with /api/lab/seo/', () => {
    for (const row of CONTRACT) {
      it(`${row.method} ${row.proxy}`, () => {
        expect(row.proxy).toMatch(/^\/api\/lab\/seo\//);
      });
    }
  });

  describe('backend targets are in KNOWN_BACKEND_ENDPOINTS', () => {
    for (const row of CONTRACT) {
      it(`${row.method} ${row.proxy} → ${row.backend}`, () => {
        // The backend field uses the fixture's "METHOD /path" format.
        // For the special case where proxy converts POST→GET (gap endpoints),
        // we assert the BACKEND method (GET) is in the known set.
        expect(
          KNOWN_BACKEND_ENDPOINTS.has(row.backend),
          `Backend endpoint "${row.backend}" is not in KNOWN_BACKEND_ENDPOINTS fixture.\n` +
          `Proxy: ${row.method} ${row.proxy}\n` +
          (row.note ? `Note: ${row.note}` : ''),
        ).toBe(true);
      });
    }
  });

  describe('POST→GET proxy bridge contracts', () => {
    const bridged = CONTRACT.filter(r => r.method === 'POST' && r.backend.startsWith('GET '));
    it('bridge entries are intentional (backlinks/gap and competitors/gap only)', () => {
      const bridgedProxies = bridged.map(r => r.proxy).sort();
      expect(bridgedProxies).toEqual([
        '/api/lab/seo/backlinks/gap',
        '/api/lab/seo/competitors/gap',
      ].sort());
    });
  });

  describe('no duplicate proxy+method combinations', () => {
    it('CONTRACT has no duplicate (method, proxy) pairs', () => {
      const seen = new Set<string>();
      const dupes: string[] = [];
      for (const row of CONTRACT) {
        const key = `${row.method} ${row.proxy}`;
        if (seen.has(key)) dupes.push(key);
        seen.add(key);
      }
      expect(dupes, `Duplicate contract entries: ${dupes.join(', ')}`).toHaveLength(0);
    });
  });

  describe('known backend set coverage', () => {
    it('KNOWN_BACKEND_ENDPOINTS is non-empty', () => {
      expect(KNOWN_BACKEND_ENDPOINTS.size).toBeGreaterThan(80);
    });

    it('all entries follow "METHOD /api/agents/seo/..." format', () => {
      const invalid: string[] = [];
      for (const entry of KNOWN_BACKEND_ENDPOINTS) {
        if (!/^(GET|POST|PATCH|PUT|DELETE) \/api\/agents\/seo\//.test(entry)) {
          invalid.push(entry);
        }
      }
      expect(invalid, `Malformed entries in fixture: ${invalid.join(', ')}`).toHaveLength(0);
    });
  });

  describe('deprecated / legacy route documentation', () => {
    it('DEPRECATED_OR_INTERNAL is non-empty and each has a reason', () => {
      expect(DEPRECATED_OR_INTERNAL.length).toBeGreaterThan(0);
      for (const entry of DEPRECATED_OR_INTERNAL) {
        expect(entry.proxy).toMatch(/^\/api\/lab\/seo\//);
        expect(entry.reason.length).toBeGreaterThan(10);
      }
    });
  });
});
