import type { Metadata } from 'next';
import { AdsView } from '@/components/marketing/AdsView';

export const metadata: Metadata = {
  title: 'Pixie · Meta Ads',
  description: 'Ad accounts, campaigns, and insights via the Meta Marketing API.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdsView />;
}
