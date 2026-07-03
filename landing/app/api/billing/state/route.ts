import { NextResponse } from 'next/server';
import { getCurrentMembership, can } from '@/lib/workspace';
import { getBillingState } from '@/lib/billing';
import { stripeConfigured, PLANS } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/billing/state — the caller's workspace billing state + their billing
 *  permissions + the plan catalogue. Requires billing.view. */
export async function GET() {
  const ctx = await getCurrentMembership();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!can(ctx.membership, 'billing.view')) {
    return NextResponse.json({ error: 'forbidden', canView: false, canManage: false }, { status: 403 });
  }
  const state = await getBillingState(ctx.membership.workspaceId);
  return NextResponse.json({
    state,
    canManage: can(ctx.membership, 'billing.manage'),
    stripeReady: stripeConfigured(),
    plans: PLANS.map(({ key, name, blurb, price, features }) => ({ key, name, blurb, price, features })),
    workspace: ctx.membership.workspaceName,
  });
}
