import type { Metadata } from 'next';
import { BillingView } from '@/components/pixie-lab/AccountViews';

export const metadata: Metadata = { title: 'Billing — Pixie Lab', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default function Page() {
  return <BillingView />;
}
