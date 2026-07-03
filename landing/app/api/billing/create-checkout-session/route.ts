import { NextResponse } from 'next/server';
import { getCurrentMembership, can } from '@/lib/workspace';
import { ensureStripeCustomer } from '@/lib/billing';
import { stripe, priceIdForPlan } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/billing/create-checkout-session { plan } — requires billing.manage.
 *  Creates a Stripe Checkout session for the workspace and returns its URL. */
export async function POST(req: Request) {
  const ctx = await getCurrentMembership();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!can(ctx.membership, 'billing.manage')) {
    return NextResponse.json({ error: 'You do not have permission to manage billing.' }, { status: 403 });
  }
  if (!stripe) return NextResponse.json({ error: 'Billing is not configured yet.' }, { status: 503 });

  let planKey = '';
  try { planKey = String(((await req.json()) as { plan?: string }).plan ?? ''); } catch { /* */ }
  const priceId = priceIdForPlan(planKey);
  if (!priceId) return NextResponse.json({ error: 'That plan is not available yet.' }, { status: 400 });

  const origin = req.headers.get('origin') || new URL(req.url).origin;
  try {
    const customerId = await ensureStripeCustomer(ctx.membership.workspaceId, ctx.user.id, ctx.user.email);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: ctx.membership.workspaceId,
      metadata: { workspaceId: ctx.membership.workspaceId, planKey },
      subscription_data: { metadata: { workspaceId: ctx.membership.workspaceId, planKey } },
      success_url: `${origin}/pixie-lab/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pixie-lab/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error('[billing] checkout error', e?.message);
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 });
  }
}
