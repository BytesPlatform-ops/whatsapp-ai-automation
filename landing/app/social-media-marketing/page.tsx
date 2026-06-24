import type { Metadata } from 'next';
import { ServicePage } from '@/components/pixie/service/ServicePage';
import { getService } from '@/lib/pixieServices';

export const metadata: Metadata = {
  title: 'Social Media Content — Captions, Posts & Campaigns | Pixie',
  description:
    'Pixie turns offers, ideas, and business updates into content directions your audience can actually notice. Start your content setup.',
  alternates: { canonical: 'https://www.pixiebot.co/social-media-marketing' },
};

export default function Page() {
  return <ServicePage config={getService('social-media-marketing')!} />;
}
