import type { Metadata } from 'next';
import { SupportView } from '@/components/pixie-lab/AccountViews';

export const metadata: Metadata = { title: 'Help & support — Pixie Lab', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default function Page() {
  return <SupportView />;
}
