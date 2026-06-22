/**
 * Pixie Mascot Role Hero — data layer.
 *
 * One fixed Pixie robot mascot at centre. The ROLE is expressed by the
 * holographic PROPS that orbit the mascot, plus the copy/cards — never by
 * swapping the mascot or the background. Props are rendered as pure CSS/SVG
 * by <HolographicProp> (see PropTypes below), so they're crisp, recolourable
 * and light.
 *
 * ── ASSETS (all optional — graceful placeholders until provided) ───────────
 *   /public/images/pixie/studio-bg.webp   → fixed studio backdrop
 *   /public/images/pixie/mascot.webp      → the Pixie robot mascot
 * Drop those in at the same paths to go live; no code change required.
 */

export type PropType =
  | 'waveform'
  | 'calendar'
  | 'lead'
  | 'wireframe'
  | 'mobile-preview'
  | 'domain'
  | 'post-grid'
  | 'caption'
  | 'avatar-frame'
  | 'script'
  | 'play-card'
  | 'score-ring'
  | 'bar-chart'
  | 'checklist'
  | 'channel-nodes'
  | 'inbox'
  | 'message-flow';

export interface RoleProp {
  type: PropType;
  label: string;
}

export interface Role {
  id: string;
  label: string;
  eyebrow: string;
  heading: string;
  sub: string;
  cta: string;
  href: string;
  cards: string[];
  props: RoleProp[];
  /** Transparent Pixie-mascot "form" cutout for this role (alpha WebP). */
  image: string;
}

export const ROLES: Role[] = [
  {
    id: 'receptionist',
    image: '/images/pixie/forms/receptionist.webp',
    label: 'AI Receptionist',
    eyebrow: 'AI RECEPTIONIST',
    heading: 'Never miss a lead again.',
    sub: 'Answers every call, chat, and DM — 24/7, in any language.',
    cta: 'Meet your receptionist',
    href: '/ai-receptionist',
    cards: ['Call answered', 'Lead captured', 'Booked in calendar'],
    props: [
      { type: 'waveform', label: 'Live voice intent' },
      { type: 'calendar', label: 'Booking slot' },
      { type: 'lead', label: 'Lead profile' },
    ],
  },
  {
    id: 'website',
    image: '/images/pixie/forms/website.webp',
    label: 'Website Builder',
    eyebrow: 'AI WEBSITE BUILDER',
    heading: 'Build your website without waiting weeks.',
    sub: 'Tell Pixie what your business does and get a branded preview.',
    cta: 'Build my site',
    href: '/website-builder',
    cards: ['Homepage generated', 'Mobile version ready', 'Preview link created', 'Domain ready'],
    props: [
      { type: 'wireframe', label: 'Landing page' },
      { type: 'mobile-preview', label: 'Responsive view' },
      { type: 'domain', label: 'Domain ready' },
    ],
  },
  {
    id: 'social',
    image: '/images/pixie/forms/social.webp',
    label: 'Social Marketer',
    eyebrow: 'SOCIAL MEDIA MARKETING',
    heading: 'On-brand content at scale.',
    sub: 'Ads, captions and posts, generated and ready to ship.',
    cta: 'Create content',
    href: '/social-media-marketing',
    cards: ['3 ad variations', 'Caption written', 'Scheduled'],
    props: [
      { type: 'post-grid', label: 'Content set' },
      { type: 'caption', label: 'Caption' },
      { type: 'calendar', label: 'Schedule' },
    ],
  },
  {
    id: 'influencer',
    image: '/images/pixie/forms/influencer.webp',
    label: 'AI Influencer',
    eyebrow: 'AI INFLUENCER CONTENT',
    heading: 'Your brand, on camera.',
    sub: 'A consistent AI presence across every channel.',
    cta: 'See it in action',
    href: '/ai-influencer',
    cards: ['Avatar ready', 'Script generated', 'Video rendered'],
    props: [
      { type: 'avatar-frame', label: 'Avatar' },
      { type: 'script', label: 'Script' },
      { type: 'play-card', label: 'Reel' },
    ],
  },
  {
    id: 'seo',
    image: '/images/pixie/forms/seo.webp',
    label: 'SEO Analyst',
    eyebrow: 'SEO & GROWTH AUDIT',
    heading: 'Grow your Google ranking.',
    sub: 'Plain-English audits and the top fixes that matter.',
    cta: 'Audit my site',
    href: '/seo-audit',
    cards: ['Score: 86/100', 'Core Web Vitals', 'Top 3 fixes'],
    props: [
      { type: 'score-ring', label: '86/100' },
      { type: 'bar-chart', label: 'Vitals' },
      { type: 'checklist', label: 'Fixes' },
    ],
  },
  {
    id: 'omni',
    image: '/images/pixie/forms/omni.webp',
    label: 'Omnichannel AI',
    eyebrow: 'OMNICHANNEL AI',
    heading: 'One brain, every channel.',
    sub: 'WhatsApp, web chat, Instagram, Messenger — unified.',
    cta: 'Connect channels',
    href: '/omnichannel-ai',
    cards: ['WhatsApp', 'Instagram', 'Web chat', 'Messenger'],
    props: [
      { type: 'channel-nodes', label: 'Connected channels' },
      { type: 'inbox', label: 'Unified inbox' },
      { type: 'message-flow', label: 'Synced history' },
    ],
  },
];

export const MASCOT_SRC = '/images/pixie/mascot.webp';
export const STUDIO_BG_SRC = '/images/pixie/studio-bg.webp';

/** Resolve an image, resolving even on 404 so preloading never blocks. */
export function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve();
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}
