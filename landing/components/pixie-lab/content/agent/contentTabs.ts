import type { ServiceTab } from '@/components/pixie-lab/services/ServiceTabs';
import { contentRoutes } from '@/lib/pixie-lab/contentRoutes';

/** Unified Content workspace sub-navigation. Distinguishes the General Content
 *  Agent (written content) from the Media library (uploads) — and links out to
 *  the AI Influencer, which is a separate product. Routes come from the shared
 *  contentRoutes registry so tab targets never drift. */
export const CONTENT_TABS: ServiceTab[] = [
  { label: 'Overview', href: contentRoutes.overview() },
  { label: 'Content Agent', href: contentRoutes.agent() },
  { label: 'Generated Content', href: contentRoutes.generated() },
  { label: 'Publishing', href: contentRoutes.publishing() },
  { label: 'Calendar', href: contentRoutes.publishingCalendar() },
  { label: 'Upload Media', href: contentRoutes.uploadMedia() },
  { label: 'Media Library', href: contentRoutes.mediaLibrary() },
  { label: 'AI Influencer', href: contentRoutes.influencer() },
];

export const CONTENT_ACCENT = '#D4AF37';
