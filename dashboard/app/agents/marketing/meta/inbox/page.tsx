import type { Metadata } from 'next';
import { InboxView } from '@/components/marketing/InboxView';

export const metadata: Metadata = {
  title: 'Pixie · Meta Inbox',
  description: 'Comments and DMs with approval-based AI replies.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <InboxView type="" title="Inbox" />;
}
