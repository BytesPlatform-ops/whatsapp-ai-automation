/**
 * Single source of truth for Pixie Content-workspace routes. Import these helpers
 * instead of hardcoding `/pixie-lab/content/...` strings so a route can never drift
 * between the tab bar, cards, CTAs, dialogs and deep links. Query-carrying helpers
 * preserve workspace/document/job context across navigation.
 */

import { billingRoutes } from './billingRoutes';

const CONTENT = '/pixie-lab/content';

export const contentRoutes = {
  overview: () => CONTENT,
  agent: () => `${CONTENT}/agent`,
  generated: (opts?: { doc?: string; q?: string }) => {
    const p = new URLSearchParams();
    if (opts?.doc) p.set('doc', opts.doc);
    if (opts?.q) p.set('q', opts.q);
    const qs = p.toString();
    return qs ? `${CONTENT}/generated?${qs}` : `${CONTENT}/generated`;
  },
  publishing: (opts?: { status?: string }) =>
    opts?.status ? `${CONTENT}/publishing?status=${encodeURIComponent(opts.status)}` : `${CONTENT}/publishing`,
  publishingCalendar: () => `${CONTENT}/publishing/calendar`,
  publishingJob: (id: string) => `${CONTENT}/publishing?job=${encodeURIComponent(id)}`,
  uploadMedia: () => `${CONTENT}/create`,
  mediaLibrary: () => `${CONTENT}/library`,
  fullService: () => `${CONTENT}/full-service`,
  influencer: () => '/pixie-lab/content-creator',
  billing: () => billingRoutes.overview(),
  billingCenter: () => billingRoutes.center(),
} as const;

export type ContentRouteKey = keyof typeof contentRoutes;

/** The complete Content workspace navigation — the single source for the sidebar
 *  submenu (and anywhere else the section list is needed). User-facing labels;
 *  destinations come from the helpers above so they never drift. */
export interface ContentNavItem { label: string; href: string }

export const CONTENT_NAV: ContentNavItem[] = [
  { label: 'Overview', href: contentRoutes.overview() },
  { label: 'Content Agent', href: contentRoutes.agent() },
  { label: 'Generated Content', href: contentRoutes.generated() },
  { label: 'Publishing', href: contentRoutes.publishing() },
  { label: 'Calendar', href: contentRoutes.publishingCalendar() },
  { label: 'Upload Media', href: contentRoutes.uploadMedia() },
  { label: 'Media Library', href: contentRoutes.mediaLibrary() },
  { label: 'AI Influencer', href: contentRoutes.influencer() },
];

/** True when the path is inside the Content workspace — includes the AI Influencer
 *  route, which lives at /pixie-lab/content-creator (a sibling of /pixie-lab/content). */
export function isContentRoute(pathname: string): boolean {
  const overview = contentRoutes.overview();
  const influencer = contentRoutes.influencer();
  return (
    pathname === overview || pathname.startsWith(overview + '/')
    || pathname === influencer || pathname.startsWith(influencer + '/')
  );
}

/** The CONTENT_NAV href that best matches the current path (longest prefix), so a
 *  nested detail route highlights its correct parent item and Publishing vs Calendar
 *  are never both active. Returns '' when the path isn't a Content route. */
export function activeContentHref(pathname: string): string {
  let best = '';
  for (const item of CONTENT_NAV) {
    const base = item.href.split('?')[0];
    if ((pathname === base || pathname.startsWith(base + '/')) && base.length > best.length) {
      best = item.href;
    }
  }
  return best;
}
