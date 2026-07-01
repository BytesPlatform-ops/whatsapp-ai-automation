import type { Metadata } from 'next';
import { NotificationsView } from '@/components/pixie-lab/AccountViews';

export const metadata: Metadata = { title: 'Notifications — Pixie Lab', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default function Page() {
  return <NotificationsView />;
}
