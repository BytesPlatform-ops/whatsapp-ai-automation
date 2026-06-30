import type { Metadata } from 'next';
import { QuickSetup } from '@/components/pixie-lab/QuickSetup';

export const metadata: Metadata = {
  title: 'Quick Setup — Pixie',
  description: 'Tell Pixie about your business so it can start finding useful actions.',
  robots: { index: false, follow: false },
};

export default function QuickSetupPage() {
  return <QuickSetup />;
}
