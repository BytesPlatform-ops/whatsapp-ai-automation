import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { billingRoutes } from '@/lib/pixie-lab/billingRoutes';

export const metadata: Metadata = {
  title: 'Billing Center — Pixie Lab',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

/**
 * /pixie-lab/billing/center — kept for back-compat.
 * Redirects to the new agent-neutral /pixie-lab/billing overview.
 */
export default function BillingCenterPage() {
  redirect(billingRoutes.overview());
}
