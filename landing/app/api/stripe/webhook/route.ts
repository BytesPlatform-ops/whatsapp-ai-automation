import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe, planKeyForPriceId } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/webhook — verifies the Stripe signature against the RAW body,
 * records each event once (billing_events.stripe_event_id unique → idempotent),
 * and syncs subscription state. Never trusts client data.
 */
export async function POST(req: Request) {
  if (!stripe) return NextResponse.json({ error: 'not configured' }, { status: 503 });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'no webhook secret' }, { status: 503 });

  const sig = req.headers.get('stripe-signature') ?? '';
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (e: any) {
    console.error('[stripe] bad signature', e?.message);
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  // Idempotency: unique stripe_event_id. A duplicate throws → we ack 200 and skip.
  try {
    await prisma.billingEvent.create({
      data: { stripeEventId: event.id, type: event.type, payload: JSON.parse(JSON.stringify(event.data.object)) },
    });
  } catch {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(String(session.subscription));
          await syncSubscription(sub, session.metadata?.workspaceId);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await prisma.subscription.updateMany({ where: { stripeSubscriptionId: sub.id }, data: { status: 'canceled' } });
        break;
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        const subId = (inv as any).subscription;
        if (subId) await prisma.subscription.updateMany({ where: { stripeSubscriptionId: String(subId) }, data: { status: 'past_due' } });
        break;
      }
      case 'invoice.payment_succeeded':
        // period is refreshed via the subscription.updated event that follows.
        break;
    }
  } catch (e: any) {
    console.error('[stripe] handler error', event.type, e?.message);
    // Return 200 so Stripe doesn't retry a non-signature failure forever; the
    // event is already recorded for reconciliation.
  }

  return NextResponse.json({ received: true });
}

async function syncSubscription(sub: Stripe.Subscription, workspaceIdHint?: string) {
  const workspaceId = sub.metadata?.workspaceId || workspaceIdHint;
  if (!workspaceId) return;
  const priceId = sub.items.data[0]?.price?.id;
  const planKey = planKeyForPriceId(priceId) ?? (sub.metadata?.planKey || 'unknown');
  const anySub = sub as any;
  const data = {
    workspaceId,
    stripeSubscriptionId: sub.id,
    stripeCustomerId: String(sub.customer),
    planKey,
    status: sub.status,
    currentPeriodStart: anySub.current_period_start ? new Date(anySub.current_period_start * 1000) : null,
    currentPeriodEnd: anySub.current_period_end ? new Date(anySub.current_period_end * 1000) : null,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
  };
  await prisma.subscription.upsert({
    where: { stripeSubscriptionId: sub.id },
    create: data,
    update: data,
  });
}
