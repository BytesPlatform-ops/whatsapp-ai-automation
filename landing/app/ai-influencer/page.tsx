import type { Metadata } from 'next';
import { ServicePage } from '@/components/pixie/service/ServicePage';
import { getService } from '@/lib/pixieServices';

export const metadata: Metadata = {
  title: 'AI Influencer — Brand Video & Avatar Campaigns | Pixie',
  description:
    'Pixie shapes AI avatar-style campaigns so your brand can show up with video ideas without a full production shoot. Start your video setup.',
  alternates: { canonical: 'https://www.pixiebot.co/ai-influencer' },
};

export default function Page() {
  return <ServicePage config={getService('ai-influencer')!} />;
}
