import type { Metadata } from 'next';
import { InboxView } from '@/components/marketing/InboxView';

export const metadata: Metadata = {
  title: 'Pixie · Meta Comments',
  description: 'Manage comments with AI triage and approval-gated replies.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <InboxView type="comment" title="Comments" />;
}
