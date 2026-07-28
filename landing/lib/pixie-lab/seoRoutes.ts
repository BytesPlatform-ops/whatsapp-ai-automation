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
  // ── Off-site ────────────────────────────────────────────────────────────────
  backlinks: (opts?: { site_id?: string }) =>
    opts?.site_id ? `${SEO}/backlinks?site_id=${encodeURIComponent(opts.site_id)}` : `${SEO}/backlinks`,
  outreach: () => `${SEO}/outreach`,
  // ── Local SEO ───────────────────────────────────────────────────────────────
  local: () => `${SEO}/local`,
  locations: () => `${SEO}/locations`,
  reviews: (opts?: { location_id?: string }) =>
    opts?.location_id ? `${SEO}/reviews?location_id=${encodeURIComponent(opts.location_id)}` : `${SEO}/reviews`,
  citations: () => `${SEO}/citations`,
  // ── Monitor ─────────────────────────────────────────────────────────────────
  schedulerStatus: () => `${SEO}/scheduler`,
  billingUsage: () => `${SEO}/billing-usage`,
} as const;

export type SeoRouteKey = keyof typeof seoRoutes;

/** User-facing nav item shape (matches ContentNavItem). */
export interface SeoNavItem {
  label: string;
  href: string;
}

/** A collapsible nav group for the SEO sidebar. */
export interface SeoNavGroup {
  group: string;
  items: SeoNavItem[];
  /** If true the group is expanded by default when any item is active. */
  defaultOpen?: boolean;
}

/** Grouped SEO navigation — structured into collapsible sections. */
export const SEO_NAV_GROUPED: SeoNavGroup[] = [
  {
    group: 'Overview',
    items: [{ label: 'Overview', href: seoRoutes.overview() }],
    defaultOpen: true,
  },
  {
    group: 'Research',
    items: [
      { label: 'Sites', href: seoRoutes.sites() },
      { label: 'Audits', href: seoRoutes.audit() },
      { label: 'Crawl Jobs', href: seoRoutes.crawls() },
      { label: 'Technical Issues', href: seoRoutes.issues() },
      { label: 'Pages', href: seoRoutes.pages() },
    ],
  },
  {
    group: 'Rankings',
    items: [
      { label: 'Keywords', href: seoRoutes.keywords() },
      { label: 'Rankings', href: seoRoutes.rankings() },
      { label: 'Competitors', href: seoRoutes.competitors() },
      { label: 'Opportunities', href: seoRoutes.opportunities() },
      { label: 'Optimise', href: seoRoutes.optimise() },
      { label: 'Content Briefs', href: seoRoutes.briefs() },
    ],
  },
  {
    group: 'Off-site',
    items: [
      { label: 'Backlinks', href: seoRoutes.backlinks() },
      { label: 'Outreach', href: seoRoutes.outreach() },
    ],
  },
  {
    group: 'Local',
    items: [
      { label: 'Local SEO', href: seoRoutes.local() },
      { label: 'Locations', href: seoRoutes.locations() },
      { label: 'Reviews', href: seoRoutes.reviews() },
      { label: 'Citations', href: seoRoutes.citations() },
    ],
  },
  {
    group: 'Monitor',
    items: [
      { label: 'Alerts', href: seoRoutes.alerts() },
      { label: 'Reports', href: seoRoutes.reports() },
      { label: 'History', href: seoRoutes.history() },
      { label: 'Connections', href: seoRoutes.connections() },
    ],
  },
];

/** Flat list derived from groups — used by PixieLabShell subnav and ServiceTabs.
 *  Keeps the public surface identical to the old SEO_NAV shape. */
export const SEO_NAV: SeoNavItem[] = SEO_NAV_GROUPED.flatMap((g) => g.items);

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
