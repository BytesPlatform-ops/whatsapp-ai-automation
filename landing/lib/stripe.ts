import 'server-only';
import Stripe from 'stripe';

/**
 * Server-only Stripe client + plan catalogue. Keys/price IDs come from env
 * (STRIPE_SECRET_KEY, STRIPE_PRICE_*). `stripe` is null until the secret key is
 * set, so the app degrades gracefully before billing is configured.
 */
export const stripe: Stripe | null = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export function stripeConfigured(): boolean {
  return Boolean(stripe);
}

export interface Plan { key: string; name: string; blurb: string; price: string; priceEnv: string; features: string[] }

export const PLANS: Plan[] = [
  { key: 'pro', name: 'Pro', blurb: 'For solo founders getting started.', price: '$29/mo', priceEnv: 'STRIPE_PRICE_PRO_MONTHLY',
    features: ['All Pixie agents', 'Up to 3 workspaces', 'Email support'] },
  { key: 'business', name: 'Business', blurb: 'For growing teams.', price: '$79/mo', priceEnv: 'STRIPE_PRICE_BUSINESS_MONTHLY',
    features: ['Everything in Pro', 'Team members & roles', 'Priority support'] },
  { key: 'agency', name: 'Agency', blurb: 'For agencies & multi-brand.', price: '$199/mo', priceEnv: 'STRIPE_PRICE_AGENCY_MONTHLY',
    features: ['Everything in Business', 'Unlimited workspaces', 'Dedicated support'] },
];

export function priceIdForPlan(planKey: string): string | null {
  const plan = PLANS.find((p) => p.key === planKey);
  if (!plan) return null;
  return process.env[plan.priceEnv] || null;
}

export function planKeyForPriceId(priceId: string | null | undefined): string | null {
  if (!priceId) return null;
  return PLANS.find((p) => process.env[p.priceEnv] === priceId)?.key ?? null;
}
