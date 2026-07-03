import { NextResponse } from 'next/server';
import { getCurrentMembership, can } from '@/lib/workspace';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/billing/create-portal-session — requires billing.manage. Opens the
 *  Stripe Customer Portal for the workspace's customer. */
export async function POST(req: Request) {
  const ctx = await getCurrentMembership();
  if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!can(ctx.membership, 'billing.manage')) {
    return NextResponse.json({ error: 'You do not have permission to manage billing.' }, { status: 403 });
  }
  if (!stripe) return NextResponse.json({ error: 'Billing is not configured yet.' }, { status: 503 });

  const customer = await prisma.billingCustomer.findFirst({ where: { workspaceId: ctx.membership.workspaceId } });
  if (!customer) return NextResponse.json({ error: 'No billing account yet — start a plan first.' }, { status: 400 });

  const origin = req.headers.get('origin') || new URL(req.url).origin;
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.stripeCustomerId,
      return_url: `${origin}/pixie-lab/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error('[billing] portal error', e?.message);
    return NextResponse.json({ error: 'Could not open the billing portal. Please try again.' }, { status: 500 });
  }
}
