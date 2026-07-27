/**
 * BILLING PRODUCT REGISTRY — single source of truth for which agents participate
 * in the billing system, what they measure, and how they map to the agent registry
 * in `landing/lib/agents.ts`.
 *
 * Rules:
 *  - productId values are stable keys (match backend/credits/products.py).
 *  - agentId is the `slug` from AGENTS in agents.ts — NEVER build one here.
 *  - Import agents.ts helpers to derive display names / icons / routes; do NOT
 *    duplicate them.
 *  - billingActive=false: the product is registered but no metering is wired yet;
 *    its billing view shows zeros.
 *  - implemented=false: the agent feature itself is not fully live — the billing
 *    view can still be shown but is clearly labelled.
 */

import { AGENTS, getAgentBySlug, type PixieUnit } from '@/lib/agents';

// ── stable product ids ────────────────────────────────────────────────────────────
// Must match PRODUCT_IDS in backend/credits/products.py.
export type BillingProductId =
  | 'content_agent'
  | 'ai_influencer'
  | 'seo_agent'
  | 'social_marketer'
  | 'ai_receptionist';

export const BILLING_PRODUCT_IDS = new Set<string>([
  'content_agent',
  'ai_influencer',
  'seo_agent',
  'social_marketer',
  'ai_receptionist',
]);

// ── per-product spec ──────────────────────────────────────────────────────────────

export interface BillingProductSpec {
  /** Stable server-side id — used as the `?product=` query param. */
  productId: BillingProductId;
  /** Human display name (derived from agents.ts where possible). */
  displayName: string;
  /** Slug from AGENTS in agents.ts — use getAgentBySlug to look up the PixieUnit. */
  agentId: string;
  /** Icon id (Lucide name) — derived from the agent registry. */
  icon: string;
  /** Accent colour — derived from the agent registry. */
  accent: string;
  /** Dashboard / agent path inside Pixie Lab. */
  dashboardRoute: string;
  /** Operation-type strings that count credits for this product (mirrors backend). */
  supportedOperations: readonly string[];
  /** Usage counter keys returned by /api/billing/usage?product=<id>. */
  usageCounterKeys: readonly string[];
  /** The access flag key in the entitlements.access map. Empty = no dedicated flag. */
  entitlementKey: string;
  /** True if billing metering is actively wired for this product. */
  billingActive: boolean;
  /** True if the agent feature itself is considered implemented (can be live but with zero usage). */
  implemented: boolean;
}

// Resolve a PixieUnit from agents.ts or return a safe fallback.
function agentOr(slug: string, fallback: { icon: string; accent: string; dashboardPath: string; name: string }): Pick<PixieUnit, 'icon' | 'accent' | 'dashboardPath' | 'name'> {
  return getAgentBySlug(slug) ?? fallback;
}

// ── registry ──────────────────────────────────────────────────────────────────────

export const BILLING_PRODUCTS: Record<BillingProductId, BillingProductSpec> = {
  content_agent: (() => {
    const agent = agentOr('content-creator', { icon: 'clapperboard', accent: '#D4AF37', dashboardPath: '/pixie-lab/content', name: 'Content Agent' });
    return {
      productId: 'content_agent',
      displayName: 'Content Agent',
      agentId: 'content-creator',
      icon: agent.icon,
      accent: agent.accent,
      dashboardRoute: '/pixie-lab/content/agent',
      supportedOperations: ['content_text'] as const,
      usageCounterKeys: ['content_text', 'documents'] as const,
      entitlementKey: 'content_agent',
      billingActive: true,
      implemented: true,
    };
  })(),

  ai_influencer: (() => {
    const agent = agentOr('content-creator', { icon: 'clapperboard', accent: '#D4AF37', dashboardPath: '/pixie-lab/content-creator', name: 'AI Influencer' });
    return {
      productId: 'ai_influencer',
      displayName: 'AI Influencer',
      agentId: 'content-creator',
      icon: agent.icon,
      accent: '#F59E0B',           // slightly different amber to distinguish from Content Agent
      dashboardRoute: '/pixie-lab/content-creator',
      supportedOperations: ['influencer_idea', 'influencer_script', 'influencer_video'] as const,
      usageCounterKeys: [
        'influencer_idea', 'influencer_script', 'influencer_video',
        'influencer_profiles', 'publish_jobs', 'connected_accounts', 'scheduled_jobs',
      ] as const,
      entitlementKey: 'ai_influencer',
      billingActive: true,
      implemented: true,
    };
  })(),

  seo_agent: (() => {
    const agent = agentOr('seo-agent', { icon: 'search', accent: '#14B8A6', dashboardPath: '/pixie-lab/seo', name: 'SEO Agent' });
    return {
      productId: 'seo_agent',
      displayName: agent.name,
      agentId: 'seo-agent',
      icon: agent.icon,
      accent: agent.accent,
      dashboardRoute: agent.dashboardPath,
      supportedOperations: ['seo_audit', 'seo_keyword_research', 'seo_fix'] as const,
      usageCounterKeys: ['seo_audits', 'seo_jobs'] as const,
      entitlementKey: '',          // no dedicated plans.access flag yet
      billingActive: true,
      implemented: true,
    };
  })(),

  social_marketer: (() => {
    const agent = agentOr('marketing-agent', { icon: 'megaphone', accent: '#EC4899', dashboardPath: '/pixie-lab/marketing', name: 'Marketing' });
    return {
      productId: 'social_marketer',
      displayName: agent.name,
      agentId: 'marketing-agent',
      icon: agent.icon,
      accent: agent.accent,
      dashboardRoute: agent.dashboardPath,
      supportedOperations: ['marketing_campaign', 'marketing_brief'] as const,
      usageCounterKeys: ['marketing_jobs'] as const,
      entitlementKey: '',
      billingActive: false,
      implemented: false,
    };
  })(),

  ai_receptionist: (() => {
    const agent = agentOr('ai-receptionist', { icon: 'headset', accent: '#E6B45A', dashboardPath: '/pixie-lab/receptionist', name: 'AI Receptionist' });
    return {
      productId: 'ai_receptionist',
      displayName: agent.name,
      agentId: 'ai-receptionist',
      icon: agent.icon,
      accent: agent.accent,
      dashboardRoute: agent.dashboardPath,
      supportedOperations: ['receptionist_call', 'receptionist_booking'] as const,
      usageCounterKeys: ['receptionist_calls'] as const,
      entitlementKey: '',
      billingActive: false,
      implemented: false,
    };
  })(),
};

// ── helpers ───────────────────────────────────────────────────────────────────────

/** Ordered list of all registered billing products. */
export function getAllBillingProducts(): BillingProductSpec[] {
  return Object.values(BILLING_PRODUCTS);
}

/** Products that are actively implemented (shown in the agent selector). */
export function getImplementedBillingProducts(): BillingProductSpec[] {
  return getAllBillingProducts().filter((p) => p.implemented);
}

/** Validate a product id string from a URL param; returns the canonical id or null. */
export function validateBillingProductId(value: string | null | undefined): BillingProductId | null {
  if (!value) return null;
  const trimmed = value.trim() as BillingProductId;
  return BILLING_PRODUCT_IDS.has(trimmed) ? trimmed : null;
}

/** Look up a product spec by product id. */
export function getBillingProduct(id: string | null | undefined): BillingProductSpec | null {
  if (!id) return null;
  return BILLING_PRODUCTS[id as BillingProductId] ?? null;
}

/**
 * Map an agent slug (from agents.ts) to the primary billing product id for that agent.
 * A single agent may cover multiple products (content-creator covers both content_agent
 * and ai_influencer).  Returns the first match.
 */
export function billingProductForAgent(agentSlug: string | null | undefined): BillingProductId | null {
  if (!agentSlug) return null;
  const found = getAllBillingProducts().find((p) => p.agentId === agentSlug);
  return found ? found.productId : null;
}

// Re-export for callers that just need the raw agent list from agents.ts.
export { AGENTS };
