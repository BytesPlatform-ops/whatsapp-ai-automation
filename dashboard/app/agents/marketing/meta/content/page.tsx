import type { Metadata } from 'next';
import { ContentLibrary } from '@/components/marketing/ContentLibrary';

export const metadata: Metadata = {
  title: 'Pixie · Meta Content Library',
  description: 'Uploaded media, prepared posts/reels, and published history.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ContentLibrary />;
}
