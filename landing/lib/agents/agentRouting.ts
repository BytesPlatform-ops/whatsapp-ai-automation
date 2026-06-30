/**
 * Agent routing — maps the PUBLIC marketing-page slugs (e.g. `ai-receptionist`)
 * to the internal Lab/entitlement agent keys (e.g. `receptionist`), and exposes
 * the post-auth destinations. One source of truth so the signup→verify→dashboard
 * journey preserves whichever agent the user originally clicked.
 */

export type AgentKey = 'website' | 'receptionist' | 'seo' | 'marketing' | 'content';

/** public marketing slug → internal agent key */
export const PUBLIC_SLUG_TO_AGENT: Record<string, AgentKey> = {
  'ai-receptionist': 'receptionist',
  'website-builder': 'website',
  'seo-audit': 'seo',
  'social-media-marketing': 'marketing',
  'ai-influencer': 'content',
  'ai-content-creator': 'content', // spec alias
};

export const AGENT_LABEL: Record<AgentKey, string> = {
  website: 'Website Builder',
  receptionist: 'AI Receptionist',
  seo: 'SEO Agent',
  marketing: 'Marketing Agent',
  content: 'AI Content Creator',
};

export function agentKeyFromSlug(slug: string | null | undefined): AgentKey | null {
  if (!slug) return null;
  return PUBLIC_SLUG_TO_AGENT[slug] ?? (Object.values(PUBLIC_SLUG_TO_AGENT).includes(slug as AgentKey) ? (slug as AgentKey) : null);
}

export function agentLabelFromSlug(slug: string | null | undefined): string {
  const key = agentKeyFromSlug(slug);
  return key ? AGENT_LABEL[key] : 'Pixie';
}

/** Where a verified user lands for a given agent. Enhanced /dashboard is the home;
 *  the `?agent=` is read there to activate + spotlight that agent. */
export function agentDashboardPath(slug: string | null | undefined): string {
  const key = agentKeyFromSlug(slug);
  return key ? `/dashboard?agent=${key}` : '/dashboard';
}

/** The agent's dedicated workspace (existing Lab agent page). */
export function agentWorkspacePath(slug: string | null | undefined): string {
  const key = agentKeyFromSlug(slug);
  return key ? `/pixie-lab/agents/${key}` : '/pixie-lab/for-you';
}
