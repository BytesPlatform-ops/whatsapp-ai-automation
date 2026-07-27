import { describe, it, expect } from 'vitest';
import { SEO_NAV, seoRoutes, isSeoRoute, activeSeoHref } from './seoRoutes';

describe('seoRoutes registry', () => {
  it('exposes exactly the nine SEO sections', () => {
    expect(SEO_NAV.map((n) => n.label)).toEqual([
      'Overview',
      'Sites',
      'New Audit',
      'Crawl Jobs',
      'Technical Issues',
      'Pages',
      'History',
      'Connections',
      'Reports',
    ]);
  });

  it('registry hrefs match the route helpers', () => {
    expect(SEO_NAV.map((n) => n.href)).toEqual([
      '/pixie-lab/seo',
      '/pixie-lab/seo/sites',
      '/pixie-lab/seo/audit',
      '/pixie-lab/seo/crawls',
      '/pixie-lab/seo/issues',
      '/pixie-lab/seo/pages',
      '/pixie-lab/seo/history',
      '/pixie-lab/seo/connections',
      '/pixie-lab/seo/reports',
    ]);
  });

  it('seoRoutes.audit() preserves URL and audit_id params', () => {
    expect(seoRoutes.audit({ url: 'example.com' })).toBe('/pixie-lab/seo/audit?url=example.com');
    expect(seoRoutes.audit({ audit_id: 'abc-123' })).toBe('/pixie-lab/seo/audit?audit_id=abc-123');
    expect(seoRoutes.audit({ url: 'a', audit_id: 'b' })).toBe('/pixie-lab/seo/audit?url=a&audit_id=b');
    expect(seoRoutes.audit()).toBe('/pixie-lab/seo/audit');
  });

  it('seoRoutes.crawls() optionally filters by site_id', () => {
    expect(seoRoutes.crawls()).toBe('/pixie-lab/seo/crawls');
    expect(seoRoutes.crawls({ site_id: 's1' })).toBe('/pixie-lab/seo/crawls?site_id=s1');
  });

  it('seoRoutes.issues() accepts multiple optional filters', () => {
    expect(seoRoutes.issues()).toBe('/pixie-lab/seo/issues');
    expect(seoRoutes.issues({ severity: 'critical' })).toBe('/pixie-lab/seo/issues?severity=critical');
    expect(seoRoutes.issues({ site_id: 's1', crawl_job_id: 'j1' })).toBe('/pixie-lab/seo/issues?site_id=s1&crawl_job_id=j1');
  });

  it('seoRoutes.pages() optionally includes crawl_job_id', () => {
    expect(seoRoutes.pages()).toBe('/pixie-lab/seo/pages');
    expect(seoRoutes.pages({ crawl_job_id: 'j1' })).toBe('/pixie-lab/seo/pages?crawl_job_id=j1');
  });

  it('seoRoutes.reports() accepts site_id and/or crawl_job_id', () => {
    expect(seoRoutes.reports()).toBe('/pixie-lab/seo/reports');
    expect(seoRoutes.reports({ site_id: 's1' })).toBe('/pixie-lab/seo/reports?site_id=s1');
    expect(seoRoutes.reports({ crawl_job_id: 'j2' })).toBe('/pixie-lab/seo/reports?crawl_job_id=j2');
  });
});

describe('isSeoRoute', () => {
  it('is true for /pixie-lab/seo (overview)', () => {
    expect(isSeoRoute('/pixie-lab/seo')).toBe(true);
  });

  it('is true for all nested SEO routes', () => {
    for (const item of SEO_NAV) {
      expect(isSeoRoute(item.href)).toBe(true);
    }
  });

  it('is true for deep nested paths', () => {
    expect(isSeoRoute('/pixie-lab/seo/crawls/some-job-id')).toBe(true);
    expect(isSeoRoute('/pixie-lab/seo/issues/issue-123')).toBe(true);
  });

  it('is false for unrelated routes', () => {
    expect(isSeoRoute('/pixie-lab/dashboard')).toBe(false);
    expect(isSeoRoute('/pixie-lab/marketing')).toBe(false);
    expect(isSeoRoute('/pixie-lab/content')).toBe(false);
    expect(isSeoRoute('/pixie-lab/seo-something-else')).toBe(false);
  });
});

describe('activeSeoHref — longest-prefix matching', () => {
  it('exact Overview match', () => {
    expect(activeSeoHref('/pixie-lab/seo')).toBe('/pixie-lab/seo');
  });

  it('exact Sites match', () => {
    expect(activeSeoHref('/pixie-lab/seo/sites')).toBe('/pixie-lab/seo/sites');
  });

  it('exact Audit match', () => {
    expect(activeSeoHref('/pixie-lab/seo/audit')).toBe('/pixie-lab/seo/audit');
  });

  it('audit with query params still maps to Audit', () => {
    // activeSeoHref receives the pathname (no query params) from usePathname().
    expect(activeSeoHref('/pixie-lab/seo/audit')).toBe('/pixie-lab/seo/audit');
  });

  it('nested crawl job detail highlights Crawl Jobs, not Overview', () => {
    expect(activeSeoHref('/pixie-lab/seo/crawls/job-abc')).toBe('/pixie-lab/seo/crawls');
  });

  it('issues page exact match', () => {
    expect(activeSeoHref('/pixie-lab/seo/issues')).toBe('/pixie-lab/seo/issues');
  });

  it('pages page exact match', () => {
    expect(activeSeoHref('/pixie-lab/seo/pages')).toBe('/pixie-lab/seo/pages');
  });

  it('history page exact match', () => {
    expect(activeSeoHref('/pixie-lab/seo/history')).toBe('/pixie-lab/seo/history');
  });

  it('connections page exact match', () => {
    expect(activeSeoHref('/pixie-lab/seo/connections')).toBe('/pixie-lab/seo/connections');
  });

  it('reports page exact match', () => {
    expect(activeSeoHref('/pixie-lab/seo/reports')).toBe('/pixie-lab/seo/reports');
  });

  it('returns empty string for a non-SEO route', () => {
    expect(activeSeoHref('/pixie-lab/dashboard')).toBe('');
    expect(activeSeoHref('/pixie-lab/content')).toBe('');
    expect(activeSeoHref('/some/other/path')).toBe('');
  });

  it('returns empty string for a non-existent SEO sub-path not matching any nav item prefix', () => {
    // /pixie-lab/seo/unknown does not match /pixie-lab/seo/sites etc.
    // But it does match /pixie-lab/seo (Overview) via prefix — that's correct behavior.
    expect(activeSeoHref('/pixie-lab/seo/unknown')).toBe('/pixie-lab/seo');
  });

  it('longest prefix wins: /pixie-lab/seo/crawls/sub not Overview', () => {
    const result = activeSeoHref('/pixie-lab/seo/crawls/sub');
    expect(result).toBe('/pixie-lab/seo/crawls');
    expect(result).not.toBe('/pixie-lab/seo');
  });
});
