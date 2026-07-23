/**
 * Single source of truth for Pixie Content-workspace routes. Import these helpers
 * instead of hardcoding `/pixie-lab/content/...` strings so a route can never drift
 * between the tab bar, cards, CTAs, dialogs and deep links. Query-carrying helpers
 * preserve workspace/document/job context across navigation.
 */

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
  billing: () => '/pixie-lab/billing',
  billingCenter: () => '/pixie-lab/billing/center',
} as const;

export type ContentRouteKey = keyof typeof contentRoutes;
