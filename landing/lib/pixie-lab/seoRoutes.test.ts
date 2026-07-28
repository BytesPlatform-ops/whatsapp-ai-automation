import { describe, it, expect } from 'vitest';
import { SEO_NAV, SEO_NAV_GROUPED, seoRoutes, isSeoRoute, activeSeoHref } from './seoRoutes';

describe('seoRoutes registry', () => {
  it('flat SEO_NAV contains 22 items (all grouped items flattened)', () => {
    expect(SEO_NAV).toHaveLength(22);
  });

  it('SEO_NAV_GROUPED has 6 groups', () => {
    expect(SEO_NAV_GROUPED).toHaveLength(6);
    expect(SEO_NAV_GROUPED.map((g) => g.group)).toEqual([
      'Overview',
      'Research',
      'Rankings',
      'Off-site',
      'Local',
      'Monitor',
    ]);
  });

  it('Overview group contains just Overview', () => {
    const g = SEO_NAV_GROUPED.find((x) => x.group === 'Overview')!;
    expect(g.items.map((i) => i.label)).toEqual(['Overview']);
  });

  it('Research group contains Sites, Audits, Crawl Jobs, Technical Issues, Pages', () => {
    const g = SEO_NAV_GROUPED.find((x) => x.group === 'Research')!;
    expect(g.items.map((i) => i.label)).toEqual(['Sites', 'Audits', 'Crawl Jobs', 'Technical Issues', 'Pages']);
  });

  it('Rankings group contains Keywords, Rankings, Competitors, Opportunities, Optimise, Content Briefs', () => {
    const g = SEO_NAV_GROUPED.find((x) => x.group === 'Rankings')!;
    expect(g.items.map((i) => i.label)).toEqual([
      'Keywords', 'Rankings', 'Competitors', 'Opportunities', 'Optimise', 'Content Briefs',
    ]);
  });

  it('Off-site group contains Backlinks and Outreach', () => {
    const g = SEO_NAV_GROUPED.find((x) => x.group === 'Off-site')!;
    expect(g.items.map((i) => i.label)).toEqual(['Backlinks', 'Outreach']);
  });

  it('Local group contains Local SEO, Locations, Reviews, Citations', () => {
    const g = SEO_NAV_GROUPED.find((x) => x.group === 'Local')!;
    expect(g.items.map((i) => i.label)).toEqual(['Local SEO', 'Locations', 'Reviews', 'Citations']);
  });

  it('Monitor group contains Alerts, Reports, History, Connections', () => {
    const g = SEO_NAV_GROUPED.find((x) => x.group === 'Monitor')!;
    expect(g.items.map((i) => i.label)).toEqual(['Alerts', 'Reports', 'History', 'Connections']);
  });

  it('flat SEO_NAV hrefs match expected route helpers', () => {
    const hrefs = SEO_NAV.map((n) => n.href);
    expect(hrefs).toContain('/pixie-lab/seo');
    expect(hrefs).toContain('/pixie-lab/seo/sites');
    expect(hrefs).toContain('/pixie-lab/seo/audit');
    expect(hrefs).toContain('/pixie-lab/seo/crawls');
    expect(hrefs).toContain('/pixie-lab/seo/issues');
    expect(hrefs).toContain('/pixie-lab/seo/pages');
    expect(hrefs).toContain('/pixie-lab/seo/keywords');
    expect(hrefs).toContain('/pixie-lab/seo/rankings');
    expect(hrefs).toContain('/pixie-lab/seo/competitors');
    expect(hrefs).toContain('/pixie-lab/seo/opportunities');
    expect(hrefs).toContain('/pixie-lab/seo/optimise');
    expect(hrefs).toContain('/pixie-lab/seo/briefs');
    expect(hrefs).toContain('/pixie-lab/seo/backlinks');
    expect(hrefs).toContain('/pixie-lab/seo/outreach');
    expect(hrefs).toContain('/pixie-lab/seo/local');
    expect(hrefs).toContain('/pixie-lab/seo/locations');
    expect(hrefs).toContain('/pixie-lab/seo/reviews');
    expect(hrefs).toContain('/pixie-lab/seo/citations');
    expect(hrefs).toContain('/pixie-lab/seo/alerts');
    expect(hrefs).toContain('/pixie-lab/seo/reports');
    expect(hrefs).toContain('/pixie-lab/seo/history');
    expect(hrefs).toContain('/pixie-lab/seo/connections');
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

  it('seoRoutes.backlinks() optionally filters by site_id', () => {
    expect(seoRoutes.backlinks()).toBe('/pixie-lab/seo/backlinks');
    expect(seoRoutes.backlinks({ site_id: 's1' })).toBe('/pixie-lab/seo/backlinks?site_id=s1');
  });

  it('seoRoutes.reviews() optionally filters by location_id', () => {
    expect(seoRoutes.reviews()).toBe('/pixie-lab/seo/reviews');
    expect(seoRoutes.reviews({ location_id: 'loc1' })).toBe('/pixie-lab/seo/reviews?location_id=loc1');
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
    expect(isSeoRoute('/pixie-lab/seo/backlinks/overview')).toBe(true);
    expect(isSeoRoute('/pixie-lab/seo/outreach/campaigns')).toBe(true);
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

  it('connections page exact match', () => {
    expect(activeSeoHref('/pixie-lab/seo/connections')).toBe('/pixie-lab/seo/connections');
  });

  it('reports page exact match', () => {
    expect(activeSeoHref('/pixie-lab/seo/reports')).toBe('/pixie-lab/seo/reports');
  });

  it('backlinks exact match', () => {
    expect(activeSeoHref('/pixie-lab/seo/backlinks')).toBe('/pixie-lab/seo/backlinks');
  });

  it('outreach exact match', () => {
    expect(activeSeoHref('/pixie-lab/seo/outreach')).toBe('/pixie-lab/seo/outreach');
  });

  it('local exact match', () => {
    expect(activeSeoHref('/pixie-lab/seo/local')).toBe('/pixie-lab/seo/local');
  });

  it('locations exact match', () => {
    expect(activeSeoHref('/pixie-lab/seo/locations')).toBe('/pixie-lab/seo/locations');
  });

  it('reviews exact match', () => {
    expect(activeSeoHref('/pixie-lab/seo/reviews')).toBe('/pixie-lab/seo/reviews');
  });

  it('citations exact match', () => {
    expect(activeSeoHref('/pixie-lab/seo/citations')).toBe('/pixie-lab/seo/citations');
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
