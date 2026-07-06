import type { Metadata } from 'next';
import { ApprovalsView } from '@/components/marketing/ApprovalsView';

export const metadata: Metadata = {
  title: 'Pixie · Meta Approvals',
  description: 'Approve, edit, or skip Marketing Agent actions.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ApprovalsView />;
}
