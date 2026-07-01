/**
 * PIXIE UNIT REGISTRY — the SINGLE source of truth for agent + Omni identity and
 * routing. Frontend routes use `slug`; backend services use `backendKey`;
 * dashboard links use `dashboardPath`; full-service buttons use `fullServicePath`.
 * Omni is a separate central unit (not a normal agent). NEVER build a path from a
 * display name or backendKey — always go through the helpers below.
 */

export type AgentBackendKey = 'website' | 'receptionist' | 'seo' | 'marketing' | 'content';

export interface PixieUnit {
  type: 'agent' | 'omni';
  slug: string;
  backendKey: string;
  name: string;
  publicPath: string;
  dashboardPath: string;
  fullServicePath: string;
  trialEnabled: boolean;
  accent: string; // hex, matches the Lab palette
  icon: string; // lucide name resolved in the UI
  description: string;
}

export const AGENTS = {
  'ai-receptionist': {
    type: 'agent', slug: 'ai-receptionist', backendKey: 'receptionist', name: 'AI Receptionist',
    publicPath: '/ai-receptionist', dashboardPath: '/pixie-lab/receptionist', fullServicePath: '/pixie-lab/receptionist/full-service',
    trialEnabled: true, accent: '#E6B45A', icon: 'headset',
    description: 'Handle calls, bookings, FAQs, quotes, customer questions, and lead follow-ups.',
  },
  'website-builder': {
    type: 'agent', slug: 'website-builder', backendKey: 'website', name: 'Website Builder',
    publicPath: '/website-builder', dashboardPath: '/pixie-lab/website', fullServicePath: '/pixie-lab/website/full-service',
    trialEnabled: true, accent: '#3B82F6', icon: 'globe',
    description: 'Build, edit, publish, and improve business websites from conversation.',
  },
  'seo-agent': {
    type: 'agent', slug: 'seo-agent', backendKey: 'seo', name: 'SEO Agent',
    publicPath: '/seo-audit', dashboardPath: '/pixie-lab/seo', fullServicePath: '/pixie-lab/seo/full-service',
    trialEnabled: true, accent: '#14B8A6', icon: 'search',
    description: 'Audit websites, detect SEO issues, and prepare ranking improvements.',
  },
  'marketing-agent': {
    type: 'agent', slug: 'marketing-agent', backendKey: 'marketing', name: 'Marketing',
    publicPath: '/social-media-marketing', dashboardPath: '/pixie-lab/marketing', fullServicePath: '/pixie-lab/marketing/full-service',
    trialEnabled: true, accent: '#EC4899', icon: 'megaphone',
    description: 'Plan campaigns, offers, content, and reactivation workflows.',
  },
  'content-creator': {
    type: 'agent', slug: 'content-creator', backendKey: 'content', name: 'Content Creator',
    // live marketing page is /ai-influencer (alias ai-content-creator handled in normalize)
    publicPath: '/ai-influencer', dashboardPath: '/pixie-lab/content', fullServicePath: '/pixie-lab/content/full-service',
    trialEnabled: true, accent: '#D4AF37', icon: 'clapperboard',
    description: 'Create posts, reels, scripts, captions, carousels, and campaign content.',
  },
} as const satisfies Record<string, PixieUnit>;

export const OMNI = {
  type: 'omni', slug: 'omni', backendKey: 'omni', name: 'Pixie Omni',
  publicPath: '/omni', dashboardPath: '/app/omni', fullServicePath: '/app/omni/full-service',
  trialEnabled: true, accent: '#22D3EE', icon: 'sparkles',
  description: 'The central Pixie brain that routes work, creates recommendations, and coordinates all agents.',
} as const satisfies PixieUnit;

export type AgentSlug = keyof typeof AGENTS;
export type PixieRouteSlug = AgentSlug | 'omni';

const ALL_AGENTS = Object.values(AGENTS) as readonly PixieUnit[];

// ── canonical-slug normalization (mirrors the backend aliases) ──────────────────
const ALIASES: Record<string, string> = {
  omni: 'omni', 'ask-pixie': 'omni', ask_pixie: 'omni', pixie: 'omni', 'pixie-omni': 'omni',
  receptionist: 'ai-receptionist', ai_receptionist: 'ai-receptionist', 'ai-receptionist': 'ai-receptionist',
  website: 'website-builder', website_builder: 'website-builder', 'website-builder': 'website-builder',
  seo: 'seo-agent', seo_audit: 'seo-agent', 'seo-audit': 'seo-agent', seo_agent: 'seo-agent', 'seo-agent': 'seo-agent',
  marketing: 'marketing-agent', marketing_agent: 'marketing-agent', 'social-media-marketing': 'marketing-agent', 'marketing-agent': 'marketing-agent',
  content: 'content-creator', content_creator: 'content-creator', 'ai-content-creator': 'content-creator', 'content-creator': 'content-creator',
};

export function normalizeSlug(value: string | null | undefined): string | null {
  if (!value) return null;
  return ALIASES[value.trim()] ?? value.trim();
}

// ── lookups ─────────────────────────────────────────────────────────────────────
export function getAgentBySlug(slug: string | null | undefined): PixieUnit | null {
  const s = normalizeSlug(slug);
  return s ? ((AGENTS as Record<string, PixieUnit>)[s] ?? null) : null;
}

export function getPixieUnitBySlug(slug: string | null | undefined): PixieUnit | null {
  const s = normalizeSlug(slug);
  if (s === 'omni') return OMNI;
  return getAgentBySlug(s);
}

export function getAgentByPublicPath(path: string | null | undefined): PixieUnit | null {
  if (!path) return null;
  const p = path.startsWith('/') ? path : `/${path}`;
  return ALL_AGENTS.find((a) => a.publicPath === p) ?? null;
}

export function getPixieUnitByPublicPath(path: string | null | undefined): PixieUnit | null {
  if (!path) return null;
  const p = path.startsWith('/') ? path : `/${path}`;
  if (p === OMNI.publicPath) return OMNI;
  return getAgentByPublicPath(p);
}

export function getAgentByBackendKey(key: string | null | undefined): PixieUnit | null {
  if (!key) return null;
  return ALL_AGENTS.find((a) => a.backendKey === key) ?? null;
}

// ── path helpers (never hand-build a route) ─────────────────────────────────────
export function getDashboardPath(slug: string | null | undefined): string {
  return getPixieUnitBySlug(slug)?.dashboardPath ?? '/pixie-lab/dashboard';
}
export function getFullServicePath(slug: string | null | undefined): string {
  return getPixieUnitBySlug(slug)?.fullServicePath ?? '/pixie-lab/dashboard';
}
/** @deprecated use getDashboardPath */
export const getAgentDashboardPath = getDashboardPath;

export function agentNameForSlug(slug: string | null | undefined): string {
  return getPixieUnitBySlug(slug)?.name ?? 'Pixie';
}

export function getAllAgents(): readonly PixieUnit[] {
  return ALL_AGENTS;
}
export function getAllPixieUnits(): readonly PixieUnit[] {
  return [OMNI, ...ALL_AGENTS];
}
