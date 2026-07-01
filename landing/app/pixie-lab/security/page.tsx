import type { Metadata } from 'next';
import { SecurityView } from '@/components/pixie-lab/AccountViews';

export const metadata: Metadata = { title: 'Security — Pixie Lab', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default function Page() {
  return <SecurityView />;
}
