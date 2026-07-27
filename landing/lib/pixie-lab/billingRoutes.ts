/**
 * Centralized billing route helpers — the SINGLE source of truth for all billing
 * navigation paths.  Import these instead of hardcoding `/pixie-lab/billing` strings
 * so a route can never drift across the sidebar, profile menu, CTAs and deep links.
 *
 * Mirrors the pattern of contentRoutes.ts.
 */

import { validateBillingProductId, type BillingProductId } from '@/lib/pixie-lab/billingProducts';

const BILLING = '/pixie-lab/billing';

export const billingRoutes = {
  /** Workspace overview — neutral, not auto-filtered to any agent. */
  overview: () => BILLING,

  /** Billing filtered to a specific agent/product (via ?agent=<id> in the URL). */
  agent: (agentId: string | BillingProductId) => `${BILLING}?agent=${encodeURIComponent(agentId)}`,

  /** Stripe checkout / upgrade flow, optionally pre-selecting an agent context. */
  upgrade: (agentId?: string) =>
    agentId ? `${BILLING}?agent=${encodeURIComponent(agentId)}&upgrade=1` : `${BILLING}?upgrade=1`,

  /** Success page after Stripe checkout. */
  success: () => `${BILLING}/success`,

  /** Old billing center page (kept for back-compat with existing links). */
  center: () => `${BILLING}/center`,
} as const;

export type BillingRouteKey = keyof typeof billingRoutes;

/**
 * Normalize the ?agent= search param safely:
 *  - If it is a valid BillingProductId → return it.
 *  - Otherwise → return null (caller shows the all-agents overview).
 * Never throws; always safe to call with arbitrary user input.
 */
export function normalizeAgentParam(value: string | null | undefined): BillingProductId | null {
  return validateBillingProductId(value);
}

/**
 * True when the given pathname is inside the billing workspace.
 */
export function isBillingRoute(pathname: string): boolean {
  return pathname === BILLING || pathname.startsWith(BILLING + '/') || pathname.startsWith(BILLING + '?');
}
