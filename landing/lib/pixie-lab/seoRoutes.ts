/**
 * Single source of truth for Pixie SEO-workspace routes. Import these helpers
 * instead of hardcoding `/pixie-lab/seo/...` strings so a route can never drift
 * between the sidebar, tab bar, cards, CTAs, dialogs and deep links.
 *
 * Mirrors the pattern of contentRoutes.ts / billingRoutes.ts.
 */

const SEO = '/pixie-lab/seo';

export const seoRoutes = {
  overview: () => SEO,
  sites: () => `${SEO}/sites`,
  newSite: () => `${SEO}/sites/new`,
  audit: (opts?: { url?: string; audit_id?: string }) => {
    const p = new URLSearchParams();
    if (opts?.url) p.set('url', opts.url);
    if (opts?.audit_id) p.set('audit_id', opts.audit_id);
    const qs = p.toString();
    return qs ? `${SEO}/audit?${qs}` : `${SEO}/audit`;
  },
  crawls: (opts?: { site_id?: string }) =>
    opts?.site_id ? `${SEO}/crawls?site_id=${encodeURIComponent(opts.site_id)}` : `${SEO}/crawls`,
  issues: (opts?: { site_id?: string; crawl_job_id?: string; severity?: string }) => {
    const p = new URLSearchParams();
    if (opts?.site_id) p.set('site_id', opts.site_id);
    if (opts?.crawl_job_id) p.set('crawl_job_id', opts.crawl_job_id);
    if (opts?.severity) p.set('severity', opts.severity);
    const qs = p.toString();
    return qs ? `${SEO}/issues?${qs}` : `${SEO}/issues`;
  },
  pages: (opts?: { crawl_job_id?: string }) =>
    opts?.crawl_job_id ? `${SEO}/pages?crawl_job_id=${encodeURIComponent(opts.crawl_job_id)}` : `${SEO}/pages`,
  history: () => `${SEO}/history`,
  connections: () => `${SEO}/connections`,
  reports: (opts?: { site_id?: string; crawl_job_id?: string }) => {
    const p = new URLSearchParams();
    if (opts?.site_id) p.set('site_id', opts.site_id);
    if (opts?.crawl_job_id) p.set('crawl_job_id', opts.crawl_job_id);
    const qs = p.toString();
    return qs ? `${SEO}/reports?${qs}` : `${SEO}/reports`;
  },
} as const;

export type SeoRouteKey = keyof typeof seoRoutes;

/** User-facing nav item shape (matches ContentNavItem). */
export interface SeoNavItem {
  label: string;
  href: string;
}

/** The complete SEO workspace navigation — single source for the sidebar
 *  submenu and anywhere else the section list is needed. */
export const SEO_NAV: SeoNavItem[] = [
  { label: 'Overview', href: seoRoutes.overview() },
  { label: 'Sites', href: seoRoutes.sites() },
  { label: 'New Audit', href: seoRoutes.audit() },
  { label: 'Crawl Jobs', href: seoRoutes.crawls() },
  { label: 'Technical Issues', href: seoRoutes.issues() },
  { label: 'Pages', href: seoRoutes.pages() },
  { label: 'History', href: seoRoutes.history() },
  { label: 'Connections', href: seoRoutes.connections() },
  { label: 'Reports', href: seoRoutes.reports() },
];

/** True when the pathname is inside the SEO workspace. */
export function isSeoRoute(pathname: string): boolean {
  return pathname === SEO || pathname.startsWith(SEO + '/') || pathname.startsWith(SEO + '?');
}

/** The SEO_NAV href that best matches the current path (longest prefix), so a
 *  nested detail route highlights its correct parent item. Returns '' when the
 *  path isn't an SEO route. */
export function activeSeoHref(pathname: string): string {
  let best = '';
  for (const item of SEO_NAV) {
    const base = item.href.split('?')[0];
    if ((pathname === base || pathname.startsWith(base + '/')) && base.length > best.length) {
      best = item.href;
    }
  }
  return best;
}
