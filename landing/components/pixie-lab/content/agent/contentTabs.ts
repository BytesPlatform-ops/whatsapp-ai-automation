import type { ServiceTab } from '@/components/pixie-lab/services/ServiceTabs';

/** Unified Content workspace sub-navigation. Distinguishes the General Content
 *  Agent (written content) from the Media library (uploads) — and links out to
 *  the AI Influencer, which is a separate product. */
export const CONTENT_TABS: ServiceTab[] = [
  { label: 'Overview', href: '/pixie-lab/content' },
  { label: 'Content Agent', href: '/pixie-lab/content/agent' },
  { label: 'Generated', href: '/pixie-lab/content/generated' },
  { label: 'Publishing', href: '/pixie-lab/content/publishing' },
  { label: 'Calendar', href: '/pixie-lab/content/publishing/calendar' },
  { label: 'Upload Media', href: '/pixie-lab/content/create' },
  { label: 'Media Library', href: '/pixie-lab/content/library' },
  { label: 'AI Influencer', href: '/pixie-lab/content-creator' },
];

export const CONTENT_ACCENT = '#D4AF37';
