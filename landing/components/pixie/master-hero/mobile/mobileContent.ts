import { ROLE_THEMES } from '../themeMap';
import { FLYING_ROLES } from '../roleData';

/**
 * Mobile-native editorial copy for the six Pixie role scenes. Reuses the
 * existing form images (by id) and the shared role theme map — no duplicated
 * assets or colours. Headlines are pre-split into lines for staggered reveal.
 */
export interface MobileRole {
  id: string;
  label: string;
  badge: string;
  headingLines: string[];
  sub: string;
  primaryCta: string;
  secondaryCta: string;
  href: string;
  chips: string[];
  image: string;
  accent: string;
  soft: string;
}

const BY_ID = Object.fromEntries(FLYING_ROLES.map((r) => [r.id, r]));
const img = (id: string) => BY_ID[id].image;
const href = (id: string) => BY_ID[id].href;
const label = (id: string) => BY_ID[id].label;
const theme = (id: keyof typeof ROLE_THEMES) => ROLE_THEMES[id];

export const MOBILE_ROLES: MobileRole[] = [
  {
    id: 'greeter',
    label: label('greeter'),
    badge: 'LEADS',
    headingLines: ['How many leads', 'did you miss today?'],
    sub: 'Pixie answers while your team is busy, captures details, and keeps opportunities moving.',
    primaryCta: 'Meet Your Receptionist',
    secondaryCta: 'See How It Works',
    href: href('greeter'),
    chips: ['Call answered', 'Lead captured', 'Booked'],
    image: img('greeter'),
    accent: theme('greeter').accent,
    soft: theme('greeter').soft,
  },
  {
    id: 'architect',
    label: label('architect'),
    badge: 'WEBSITE',
    headingLines: ['Still waiting on', 'your website?'],
    sub: 'Tell Pixie what your business does and get a branded website preview without waiting weeks.',
    primaryCta: 'Build My Site',
    secondaryCta: 'View Examples',
    href: href('architect'),
    chips: ['Homepage ready', 'Mobile layout', 'Preview link'],
    image: img('architect'),
    accent: theme('architect').accent,
    soft: theme('architect').soft,
  },
  {
    id: 'creator',
    label: label('creator'),
    badge: 'CONTENT',
    headingLines: ['Is your brand posting…', 'or disappearing?'],
    sub: 'Pixie helps generate campaign ideas, captions, and posts so your business keeps showing up.',
    primaryCta: 'Create Content',
    secondaryCta: 'Explore Marketing',
    href: href('creator'),
    chips: ['Caption ready', 'Post idea', 'Scheduled'],
    image: img('creator'),
    accent: theme('creator').accent,
    soft: theme('creator').soft,
  },
  {
    id: 'star',
    label: label('star'),
    badge: 'AI VIDEO',
    headingLines: ['Is your brand', 'missing the spotlight?'],
    sub: 'Create AI-powered brand videos and avatar-style campaign concepts without expensive shoots.',
    primaryCta: 'See It In Action',
    secondaryCta: 'View Ideas',
    href: href('star'),
    chips: ['Avatar ready', 'Script done', 'Video concept'],
    image: img('star'),
    accent: theme('star').accent,
    soft: theme('star').soft,
  },
  {
    id: 'analyst',
    label: label('analyst'),
    badge: 'GROWTH',
    headingLines: ['Can people', 'even find you?'],
    sub: 'Pixie turns SEO, speed, and website issues into simple next steps your business can act on.',
    primaryCta: 'Audit My Site',
    secondaryCta: 'See Sample',
    href: href('analyst'),
    chips: ['Score found', 'Vitals checked', 'Fixes ready'],
    image: img('analyst'),
    accent: theme('analyst').accent,
    soft: theme('analyst').soft,
  },
  {
    id: 'core',
    label: label('core'),
    badge: 'CHANNELS',
    headingLines: ['Are your conversations', 'scattered everywhere?'],
    sub: 'Pixie brings WhatsApp, web chat, Instagram, and Messenger into one smarter conversation flow.',
    primaryCta: 'Connect Channels',
    secondaryCta: 'Explore Automation',
    href: href('core'),
    chips: ['WhatsApp', 'Instagram', 'Web chat', 'Messenger'],
    image: img('core'),
    accent: theme('core').accent,
    soft: theme('core').soft,
  },
];
