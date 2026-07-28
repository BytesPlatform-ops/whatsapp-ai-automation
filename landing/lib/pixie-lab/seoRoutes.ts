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
  // ── Search Intelligence ─────────────────────────────────────────────────────
  keywords: (opts?: { project_id?: string; site_id?: string }) => {
    const p = new URLSearchParams();
    if (opts?.project_id) p.set('project_id', opts.project_id);
    if (opts?.site_id) p.set('site_id', opts.site_id);
    const qs = p.toString();
    return qs ? `${SEO}/keywords?${qs}` : `${SEO}/keywords`;
  },
  rankings: (opts?: { project_id?: string }) =>
    opts?.project_id ? `${SEO}/rankings?project_id=${encodeURIComponent(opts.project_id)}` : `${SEO}/rankings`,
  competitors: (opts?: { site_id?: string }) =>
    opts?.site_id ? `${SEO}/competitors?site_id=${encodeURIComponent(opts.site_id)}` : `${SEO}/competitors`,
  opportunities: (opts?: { site_id?: string }) =>
    opts?.site_id ? `${SEO}/opportunities?site_id=${encodeURIComponent(opts.site_id)}` : `${SEO}/opportunities`,
  optimise: (opts?: { site_id?: string; page_id?: string; keyword?: string }) => {
    const p = new URLSearchParams();
    if (opts?.site_id) p.set('site_id', opts.site_id);
    if (opts?.page_id) p.set('page_id', opts.page_id);
    if (opts?.keyword) p.set('keyword', opts.keyword);
    const qs = p.toString();
    return qs ? `${SEO}/optimise?${qs}` : `${SEO}/optimise`;
  },
  briefs: (opts?: { site_id?: string; project_id?: string }) => {
    const p = new URLSearchParams();
    if (opts?.site_id) p.set('site_id', opts.site_id);
    if (opts?.project_id) p.set('project_id', opts.project_id);
    const qs = p.toString();
    return qs ? `${SEO}/briefs?${qs}` : `${SEO}/briefs`;
  },
  alerts: (opts?: { site_id?: string }) =>
    opts?.site_id ? `${SEO}/alerts?site_id=${encodeURIComponent(opts.site_id)}` : `${SEO}/alerts`,
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
  // ── Search Intelligence ──────────────────────────────────────────────────
  { label: 'Keywords', href: seoRoutes.keywords() },
  { label: 'Rankings', href: seoRoutes.rankings() },
  { label: 'Competitors', href: seoRoutes.competitors() },
  { label: 'Opportunities', href: seoRoutes.opportunities() },
  { label: 'Optimise', href: seoRoutes.optimise() },
  { label: 'Briefs', href: seoRoutes.briefs() },
  { label: 'Alerts', href: seoRoutes.alerts() },
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
