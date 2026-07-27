import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BillingOverview } from '@/components/pixie-lab/billing/BillingOverview';

export const metadata: Metadata = {
  title: 'Billing — Pixie Lab',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

/**
 * /pixie-lab/billing — agent-neutral billing overview with agent selector.
 * The ?agent= search param selects the per-agent view; it is read server-side
 * and passed down so selection survives full-page refresh and browser back/forward.
 *
 * Wrapped in Suspense because BillingOverview uses useSearchParams internally.
 */
export default function BillingPage() {
  return (
    <Suspense>
      <BillingOverview />
    </Suspense>
  );
}
