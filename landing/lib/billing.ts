import 'server-only';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';

const TRIAL_DAYS = 14;

export interface BillingState {
  planKey: string;
  status: string;
  trialDaysLeft: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasSubscription: boolean;
}

export async function getBillingState(workspaceId: string): Promise<BillingState> {
  const sub = await prisma.subscription.findFirst({
    where: { workspaceId, status: { in: ['active', 'trialing', 'past_due'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (sub) {
    return {
      planKey: sub.planKey,
      status: sub.status,
      trialDaysLeft: 0,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      hasSubscription: true,
    };
  }
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  const created = ws?.createdAt ?? new Date();
  const elapsedDays = Math.floor((Date.now() - created.getTime()) / 86400000);
  return {
    planKey: 'free',
    status: 'trialing',
    trialDaysLeft: Math.max(0, TRIAL_DAYS - elapsedDays),
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    hasSubscription: false,
  };
}

/** Find-or-create the Stripe customer for a workspace. */
export async function ensureStripeCustomer(workspaceId: string, userId: string, email: string | null): Promise<string> {
  if (!stripe) throw new Error('Stripe not configured');
  const existing = await prisma.billingCustomer.findFirst({ where: { workspaceId } });
  if (existing) return existing.stripeCustomerId;

  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { workspaceId, userId },
  });
  await prisma.billingCustomer.create({
    data: { workspaceId, userId, stripeCustomerId: customer.id },
  });
  return customer.id;
}
