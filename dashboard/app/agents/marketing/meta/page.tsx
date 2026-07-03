import type { Metadata } from 'next';
import { MetaMarketing } from '@/components/marketing/MetaMarketing';

export const metadata: Metadata = {
  title: 'Pixie Marketing Agent — Meta',
  description:
    'Connect Facebook & Instagram, let Pixie analyze performance, prepare posts/reels, and publish only after approval.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <MetaMarketing />;
}
