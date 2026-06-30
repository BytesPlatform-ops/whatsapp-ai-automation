/**
 * Pixie Lab feed contract + mock data (Slice 1).
 *
 * These TS types mirror the backend Pydantic `FeedCard` / `FeedCardAction` shapes
 * the feed engine will return later (backend/feed). For now the For You page
 * renders MOCK_FEED so the masonry UI is real and reviewable before the engine
 * exists. Swap MOCK_FEED for `GET /api/feed/for-you` when the backend lands.
 */

export type FeedCategory =
  | 'setup'
  | 'ready_to_approve'
  | 'growth'
  | 'customer_attention'
  | 'content_marketing'
  | 'website_seo'
  | 'system';

export type FeedPriority = 'low' | 'medium' | 'high' | 'urgent';

export type FeedAgent = 'website' | 'receptionist' | 'seo' | 'marketing' | 'content' | 'pixie';

export type FeedActionType =
  | 'approve'
  | 'preview'
  | 'edit'
  | 'do_this'
  | 'connect'
  | 'skip'
  | 'not_relevant'
  | 'remind_later'
  | 'open_agent'
  | 'start_trial'
  | 'buy_agent';

export interface FeedCardAction {
  id: string;
  label: string;
  type: FeedActionType;
  requires_confirmation?: boolean;
}

export interface FeedCard {
  id: string;
  heading: string; // 5–6 words
  full_idea: string;
  reason: string; // "why Pixie recommends this"
  category: FeedCategory;
  priority: FeedPriority;
  primary_agent: FeedAgent;
  supporting_agents?: FeedAgent[];
  source_signals?: string[];
  actions: FeedCardAction[];
  outcome?: string;
}

// ── theming ───────────────────────────────────────────────────────────────────
export const CATEGORY_THEME: Record<FeedCategory, { label: string; accent: string }> = {
  setup: { label: 'Setup', accent: '#3B82F6' },
  ready_to_approve: { label: 'Ready to approve', accent: '#25D366' },
  growth: { label: 'Growth', accent: '#8B5CF6' },
  customer_attention: { label: 'Customers', accent: '#F59E0B' },
  content_marketing: { label: 'Content', accent: '#EC4899' },
  website_seo: { label: 'Website & SEO', accent: '#22D3EE' },
  system: { label: 'System', accent: '#94A3B8' },
};

export const PRIORITY_DOT: Record<FeedPriority, string> = {
  low: '#64748b',
  medium: '#22d3ee',
  high: '#f59e0b',
  urgent: '#ef4444',
};

export const AGENT_META: Record<FeedAgent, { label: string; slug: string }> = {
  website: { label: 'Website', slug: 'website-builder' },
  receptionist: { label: 'Receptionist', slug: 'ai-receptionist' },
  seo: { label: 'SEO', slug: 'seo-audit' },
  marketing: { label: 'Marketing', slug: 'social-media-marketing' },
  content: { label: 'Content', slug: 'ai-influencer' },
  pixie: { label: 'Pixie', slug: '' },
};

// ── mock feed (Slice 1) ─────────────────────────────────────────────────────────
const A = (id: string, label: string, type: FeedActionType, requires_confirmation = false): FeedCardAction => ({
  id,
  label,
  type,
  requires_confirmation,
});

export const MOCK_FEED: FeedCard[] = [
  {
    id: 'c_website_publish',
    heading: 'Publish your first website',
    full_idea: 'Your draft homepage is ready. Publish it to a live link customers can visit and book from today.',
    reason: 'Pixie generated a homepage from your business details, but it’s still in draft.',
    category: 'setup',
    priority: 'high',
    primary_agent: 'website',
    source_signals: ['website.status = draft', 'homepage.ready = true'],
    outcome: 'A live, shareable site.',
    actions: [A('a1', 'Preview', 'preview'), A('a2', 'Publish', 'do_this', true), A('a3', 'Skip', 'skip')],
  },
  {
    id: 'c_leads_followup',
    heading: 'Three leads need follow-up',
    full_idea: 'Three people messaged in the last 24h and haven’t heard back. Pixie drafted a friendly reply for each.',
    reason: 'Leads older than 2 hours with no response convert far less often.',
    category: 'customer_attention',
    priority: 'urgent',
    primary_agent: 'receptionist',
    source_signals: ['leads.unanswered = 3'],
    outcome: '3 warm leads re-engaged.',
    actions: [A('a1', 'Approve replies', 'approve', true), A('a2', 'Edit', 'edit'), A('a3', 'Remind me later', 'remind_later')],
  },
  {
    id: 'c_reel_script',
    heading: 'Your reel script is ready',
    full_idea: 'Pixie wrote a 22-second reel script around your weekend offer, with a hook, 3 beats, and a CTA.',
    reason: 'You post best on weekends and haven’t scheduled anything yet.',
    category: 'ready_to_approve',
    priority: 'high',
    primary_agent: 'content',
    outcome: 'A reel ready to film.',
    actions: [A('a1', 'Approve', 'approve'), A('a2', 'Preview', 'preview'), A('a3', 'Edit', 'edit')],
  },
  {
    id: 'c_seo_meta',
    heading: 'Add missing meta titles',
    full_idea: '4 of your pages are missing meta titles, so Google shows a guessed snippet. Pixie wrote optimized ones.',
    reason: 'Missing meta titles lower click-through from search results.',
    category: 'website_seo',
    priority: 'medium',
    primary_agent: 'seo',
    source_signals: ['seo.pages_missing_meta = 4'],
    outcome: 'Better search click-through.',
    actions: [A('a1', 'Preview', 'preview'), A('a2', 'Apply fixes', 'do_this', true), A('a3', 'Skip', 'skip')],
  },
  {
    id: 'c_content_plan',
    heading: 'Plan this week’s content',
    full_idea: 'Pixie drafted a 7-day posting plan tuned to your audience and offers — captions and hooks included.',
    reason: 'No posts went out in the last 7 days.',
    category: 'content_marketing',
    priority: 'medium',
    primary_agent: 'marketing',
    outcome: 'A full week of posts queued.',
    actions: [A('a1', 'Review plan', 'preview'), A('a2', 'Edit', 'edit'), A('a3', 'Skip', 'skip')],
  },
  {
    id: 'c_connect_channels',
    heading: 'Connect customer message channels',
    full_idea: 'Link WhatsApp or web chat so your Receptionist can answer customers and capture leads automatically.',
    reason: 'No channels are connected yet, so the Receptionist can’t reply.',
    category: 'setup',
    priority: 'high',
    primary_agent: 'receptionist',
    outcome: 'Customers answered 24/7.',
    actions: [A('a1', 'Connect', 'connect'), A('a2', 'Not relevant', 'not_relevant')],
  },
  {
    id: 'c_homepage_cta',
    heading: 'Boost your homepage booking CTA',
    full_idea: 'Your “Book now” button is below the fold. Pixie can move it above the fold and brighten it to lift bookings.',
    reason: 'Above-the-fold CTAs typically convert 1.5–2× better.',
    category: 'growth',
    priority: 'medium',
    primary_agent: 'website',
    outcome: 'More bookings from the same traffic.',
    actions: [A('a1', 'Preview', 'preview'), A('a2', 'Approve', 'approve'), A('a3', 'Edit', 'edit')],
  },
  {
    id: 'c_hours',
    heading: 'Add your business hours',
    full_idea: 'Pixie needs your opening hours to answer “are you open?” and to set booking availability.',
    reason: 'Hours are missing from your business profile.',
    category: 'setup',
    priority: 'low',
    primary_agent: 'receptionist',
    actions: [A('a1', 'Add hours', 'do_this'), A('a2', 'Skip', 'skip')],
  },
  {
    id: 'c_trend_reel',
    heading: 'Turn a trend into a reel',
    full_idea: 'A trending audio fits your niche right now. Pixie can spin a reel concept around it before it cools off.',
    reason: 'Trending audio has a short window for reach.',
    category: 'content_marketing',
    priority: 'high',
    primary_agent: 'content',
    outcome: 'Ride a trend while it’s hot.',
    actions: [A('a1', 'See concept', 'preview'), A('a2', 'Do this', 'do_this')],
  },
  {
    id: 'c_credits',
    heading: 'Credits are running low',
    full_idea: 'You have ~12% credits left. Top up to keep content generation and audits running without interruption.',
    reason: 'Generation pauses when credits hit zero.',
    category: 'system',
    priority: 'medium',
    primary_agent: 'pixie',
    actions: [A('a1', 'Top up', 'do_this'), A('a2', 'Remind me later', 'remind_later')],
  },
];

// ── entitlements (mock for Slice 1; later from Supabase) ─────────────────────────
export type AgentState = 'active' | 'trial' | 'locked';

export interface AgentEntitlement {
  agent: FeedAgent;
  state: AgentState;
  trialEndsAt?: string; // ISO
}

export const MOCK_ENTITLEMENTS: AgentEntitlement[] = [
  { agent: 'website', state: 'active' },
  { agent: 'receptionist', state: 'trial', trialEndsAt: '2026-07-05T00:00:00Z' },
  { agent: 'seo', state: 'locked' },
  { agent: 'marketing', state: 'locked' },
  { agent: 'content', state: 'locked' },
];

// ── per-agent feeds (mock; later from GET /api/feed/agent/{agent}) ───────────────
const mk = (
  id: string,
  heading: string,
  category: FeedCategory,
  priority: FeedPriority,
  primary_agent: FeedAgent,
  full_idea: string,
  reason: string,
  actions: FeedCardAction[],
  outcome?: string,
): FeedCard => ({ id, heading, full_idea, reason, category, priority, primary_agent, actions, outcome });

export const AGENT_FEED: Partial<Record<FeedAgent, FeedCard[]>> = {
  website: [
    mk('w1', 'Publish your first website', 'setup', 'high', 'website',
      'Your draft homepage is ready — publish it to a live link customers can visit and book from.',
      'The site is built but still in draft.',
      [A('a1', 'Preview', 'preview'), A('a2', 'Publish', 'do_this', true)], 'A live, shareable site.'),
    mk('w2', 'Strengthen your homepage CTA', 'growth', 'medium', 'website',
      'Move “Book now” above the fold and brighten it to lift bookings from the same traffic.',
      'Above-the-fold CTAs convert ~1.5–2× better.',
      [A('a1', 'Preview', 'preview'), A('a2', 'Approve', 'approve')], 'More bookings, same traffic.'),
    mk('w3', 'Clean up mobile spacing', 'website_seo', 'low', 'website',
      'Two sections feel cramped on phones. Pixie can tune the spacing for a cleaner mobile read.',
      'Most of your visitors are on mobile.',
      [A('a1', 'Preview', 'preview'), A('a2', 'Apply', 'do_this')]),
    mk('w4', 'Add testimonials to homepage', 'growth', 'medium', 'website',
      'Add a 3-quote testimonial strip to build trust near your booking CTA.',
      'Social proof near CTAs raises conversions.',
      [A('a1', 'Draft it', 'do_this'), A('a2', 'Skip', 'skip')]),
    mk('w5', 'Connect your custom domain', 'setup', 'medium', 'website',
      'Point your own domain at the site so it’s yours, not a Pixie subdomain.',
      'A custom domain looks more credible.',
      [A('a1', 'Connect', 'connect'), A('a2', 'Later', 'remind_later')]),
  ],
  receptionist: [
    mk('r1', 'Add your business hours', 'setup', 'high', 'receptionist',
      'Pixie needs your opening hours to answer “are you open?” and set booking availability.',
      'Hours are missing from your profile.',
      [A('a1', 'Add hours', 'do_this'), A('a2', 'Skip', 'skip')]),
    mk('r2', 'Draft three lead follow-ups', 'customer_attention', 'urgent', 'receptionist',
      'Three leads haven’t heard back. Pixie wrote a friendly reply for each — approve to send.',
      'Leads older than 2h convert far less.',
      [A('a1', 'Approve', 'approve', true), A('a2', 'Edit', 'edit')], '3 warm leads re-engaged.'),
    mk('r3', 'Connect calendar for bookings', 'setup', 'high', 'receptionist',
      'Link Google Calendar so the Receptionist can book real appointments, not just requests.',
      'No calendar connected yet.',
      [A('a1', 'Connect', 'connect'), A('a2', 'Later', 'remind_later')], 'Real-time bookings.'),
    mk('r4', 'Create pricing FAQ replies', 'customer_attention', 'medium', 'receptionist',
      'Customers keep asking about price. Pixie drafted clear FAQ answers for the Receptionist.',
      '“How much?” is your top question.',
      [A('a1', 'Review', 'preview'), A('a2', 'Approve', 'approve')]),
    mk('r5', 'Add a human escalation contact', 'setup', 'low', 'receptionist',
      'Set who to ping when a conversation needs a real person.',
      'No escalation contact set.',
      [A('a1', 'Add contact', 'do_this'), A('a2', 'Skip', 'skip')]),
  ],
};

export function feedForAgent(agent: FeedAgent): FeedCard[] {
  return AGENT_FEED[agent] ?? [];
}

export const UPSELL_COPY: Record<FeedAgent, { teaser: string; does: string; outcome: string }> = {
  website: {
    teaser: 'Pixie can build your website',
    does: 'Turns your business details into a complete site with pages, CTAs, and a booking flow.',
    outcome: 'Launch a polished site faster.',
  },
  receptionist: {
    teaser: 'Pixie can answer customers',
    does: 'Replies across chat, WhatsApp, and SMS, captures leads, and books appointments 24/7.',
    outcome: 'Never miss a lead again.',
  },
  seo: {
    teaser: 'Pixie can boost search traffic',
    does: 'Audits your site, fixes meta and technical issues, and finds keyword opportunities.',
    outcome: 'Get found on Google.',
  },
  marketing: {
    teaser: 'Pixie can plan campaigns',
    does: 'Plans content calendars, writes captions and ads, and schedules posts across platforms.',
    outcome: 'Stay consistent without the work.',
  },
  content: {
    teaser: 'Pixie can create daily content',
    does: 'Generates hooks, scripts, reels, and AI-influencer videos from your brand.',
    outcome: 'A content engine on autopilot.',
  },
  pixie: { teaser: '', does: '', outcome: '' },
};
