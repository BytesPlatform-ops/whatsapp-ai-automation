import {
  PhoneCall,
  LayoutTemplate,
  Megaphone,
  Clapperboard,
  LineChart,
  MessagesSquare,
  type LucideIcon,
} from 'lucide-react';

/**
 * The six Pixie "roles" — written as problem-first questions, never as service
 * names. Service names appear only as the small `badge`. Each card owns its own
 * colour world (Spotify-Wrapped-style, but original) so the deck feels like a
 * wall of shareable mini-posters.
 *
 * `tone` controls text contrast: 'dark' cards use ink text, 'light' cards use
 * white text.
 */
export interface ProblemCard {
  id: string;
  badge: string;
  question: string;
  solution: string;
  chip: string;
  /** Two short pointers on HOW Pixie solves this problem. */
  solutions: [string, string];
  Icon: LucideIcon;
  /** Tailwind classes for the card's gradient background. */
  gradient: string;
  /** Accent colour (hex) used for the YES stamp glow + chip ring. */
  accent: string;
  tone: 'dark' | 'light';
}

export const PROBLEM_CARDS: ProblemCard[] = [
  {
    id: 'leads',
    badge: 'LEADS',
    question: 'Did you miss any leads today?',
    solution: 'Pixie answers while your team is busy.',
    chip: 'Lead captured',
    solutions: ['Replies to every message in seconds, 24/7', 'Captures name, need & contact automatically'],
    Icon: PhoneCall,
    gradient: 'from-[#f0d49a] via-[#e3bd80] to-[#c9a063]',
    accent: '#7a5a1e',
    tone: 'dark',
  },
  {
    id: 'website',
    badge: 'WEBSITE',
    question: 'Still waiting on your website?',
    solution: 'Turn your idea into a live-ready preview.',
    chip: 'Homepage generated',
    solutions: ['Builds a live multi-page preview in minutes', 'Edit it by just chatting — no designer'],
    Icon: LayoutTemplate,
    gradient: 'from-[#2563eb] via-[#6d28d9] to-[#06b6d4]',
    accent: '#22d3ee',
    tone: 'light',
  },
  {
    id: 'content',
    badge: 'CONTENT',
    question: 'Is your brand posting… or disappearing?',
    solution: 'Pixie keeps your content moving.',
    chip: 'Caption ready',
    solutions: ['Generates captions, posts & ad angles on demand', 'Keeps a steady posting schedule for you'],
    Icon: Megaphone,
    gradient: 'from-[#ec4899] via-[#a21caf] to-[#f97316]',
    accent: '#fb7185',
    tone: 'light',
  },
  {
    id: 'ai-video',
    badge: 'AI VIDEO',
    question: 'Is your brand missing the spotlight?',
    solution: 'Create AI-powered brand videos without the shoot.',
    chip: 'Avatar ready',
    solutions: ['Creates AI avatar videos — no camera or crew', 'Writes the script & scenes for you'],
    Icon: Clapperboard,
    gradient: 'from-[#0b0b0f] via-[#241d0c] to-[#4a3712]',
    accent: '#e8c275',
    tone: 'light',
  },
  {
    id: 'growth',
    badge: 'GROWTH',
    question: 'Can people even find you?',
    solution: "Pixie shows what's holding your website back.",
    chip: 'Top fixes found',
    solutions: ['Audits your SEO & site speed instantly', 'Hands you the top fixes, ranked by impact'],
    Icon: LineChart,
    gradient: 'from-[#0f766e] via-[#0e7490] to-[#f59e0b]',
    accent: '#fbbf24',
    tone: 'light',
  },
  {
    id: 'channels',
    badge: 'CHANNELS',
    question: 'Are your conversations scattered everywhere?',
    solution: 'Bring every channel into one AI brain.',
    chip: 'Inbox unified',
    solutions: ['Unifies WhatsApp, Instagram & Messenger in one inbox', 'One AI brain replies across every channel'],
    Icon: MessagesSquare,
    gradient: 'from-[#7c3aed] via-[#06b6d4] to-[#ec4899]',
    accent: '#67e8f9',
    tone: 'light',
  },
];

/** Waitlist seat counter — counts down from this to `SEATS_LEFT` on reveal. */
export const SEATS_START = 10000;
export const SEATS_LEFT = 98;
