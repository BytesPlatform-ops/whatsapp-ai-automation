import {
  type LucideIcon,
  Headset,
  Globe,
  Megaphone,
  Clapperboard,
  LineChart,
  MessagesSquare,
} from 'lucide-react';

/**
 * Master-hero role content. IDs align with the flight path + theme map
 * (greeter / architect / creator / star / analyst / core). Each role's `image`
 * is its transparent Pixie "form" cutout.
 */
export interface FlyingRole {
  id: string;
  label: string;
  eyebrow: string;
  heading: string;
  sub: string;
  primaryCta: string;
  secondaryCta: string;
  href: string;
  cards: string[];
  image: string;
  Icon: LucideIcon;
}

export const FLYING_ROLES: FlyingRole[] = [
  {
    id: 'greeter',
    label: 'AI Receptionist',
    eyebrow: 'AI RECEPTIONIST',
    heading: 'Never miss a lead again.',
    sub: 'Pixie answers calls, chats, and DMs — 24/7, in any language.',
    primaryCta: 'Meet your receptionist',
    secondaryCta: 'See how it works',
    href: '/ai-receptionist',
    cards: ['Call answered', 'Lead captured', 'Booked in calendar'],
    image: '/images/pixie/forms/receptionist.webp',
    Icon: Headset,
  },
  {
    id: 'architect',
    label: 'Website Builder',
    eyebrow: 'AI WEBSITE BUILDER',
    heading: 'Build your website without waiting weeks.',
    sub: 'Tell Pixie what your business does and get a branded preview ready to launch.',
    primaryCta: 'Build my site',
    secondaryCta: 'View examples',
    href: '/website-builder',
    cards: ['Homepage generated', 'Mobile-ready layout', 'Preview link created'],
    image: '/images/pixie/forms/website.webp',
    Icon: Globe,
  },
  {
    id: 'creator',
    label: 'Social Marketer',
    eyebrow: 'SOCIAL MEDIA MARKETING',
    heading: 'On-brand content at scale.',
    sub: 'Generate ads, captions, posts, and campaign angles that are ready to ship.',
    primaryCta: 'Create content',
    secondaryCta: 'Explore marketing',
    href: '/social-media-marketing',
    cards: ['3 ad variations', 'Caption written', 'Scheduled'],
    image: '/images/pixie/forms/social.webp',
    Icon: Megaphone,
  },
  {
    id: 'star',
    label: 'AI Influencer',
    eyebrow: 'AI INFLUENCER CONTENT',
    heading: 'Your brand, on camera.',
    sub: 'Create a consistent AI presence across reels, ads, and product campaigns.',
    primaryCta: 'See it in action',
    secondaryCta: 'View campaign ideas',
    href: '/ai-influencer',
    cards: ['Avatar ready', 'Script generated', 'Video concept rendered'],
    image: '/images/pixie/forms/influencer.webp',
    Icon: Clapperboard,
  },
  {
    id: 'analyst',
    label: 'SEO Analyst',
    eyebrow: 'SEO & GROWTH AUDIT',
    heading: 'Grow your Google ranking.',
    sub: 'Get plain-English audits and the top fixes that actually move the needle.',
    primaryCta: 'Audit my site',
    secondaryCta: 'See sample audit',
    href: '/seo-audit',
    cards: ['Score: 86/100', 'Core Web Vitals', 'Top 3 fixes'],
    image: '/images/pixie/forms/seo.webp',
    Icon: LineChart,
  },
  {
    id: 'core',
    label: 'Omnichannel AI',
    eyebrow: 'OMNICHANNEL AI',
    heading: 'One brain, every channel.',
    sub: 'Unify WhatsApp, web chat, Instagram, Messenger, and customer conversations.',
    primaryCta: 'Connect channels',
    secondaryCta: 'Explore automation',
    href: '/omnichannel-ai',
    cards: ['WhatsApp', 'Instagram', 'Web chat', 'Messenger'],
    image: '/images/pixie/forms/omni.webp',
    Icon: MessagesSquare,
  },
];

export const INTRO = {
  eyebrow: 'ONE AI · EVERY ROLE',
  heading: 'One AI. Every role your business needs.',
  sub: 'Pixie builds, markets, answers, audits, and connects your business from one intelligent assistant.',
  primaryCta: 'Start with Pixie',
  secondaryCta: 'Explore roles',
  primaryHref: '/ai-receptionist',
};

/** Intro chips orbiting the hub. Angle (deg) sets direction; the distance is a
 * responsive CSS var (--chip-r) so chips stay clear of the robot + headline. */
// Top-hemisphere arc (over the robot). Kept above the robot's mid-line so the
// chips never cover the face/body or the centered headline below.
export const INTRO_CHIPS = [
  { roleId: 'greeter', label: 'AI Receptionist', angle: -176 },
  { roleId: 'architect', label: 'Website Builder', angle: -140 },
  { roleId: 'creator', label: 'Social Marketer', angle: -104 },
  { roleId: 'star', label: 'AI Influencer', angle: -68 },
  { roleId: 'analyst', label: 'SEO Analyst', angle: -32 },
  { roleId: 'core', label: 'Omnichannel AI', angle: -4 },
];

export const STUDIO_BG_SRC = '/images/pixie/studio-bg.webp';

/** The friendly "normal" Pixie form — final morph state in the footer landing. */
export const NORMAL_FORM = { id: 'normal', image: '/images/pixie/forms/normal.png', label: 'Pixie' };

export function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve();
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}
