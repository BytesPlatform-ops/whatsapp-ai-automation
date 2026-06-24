import type { Metadata } from 'next';
import { ServicePage } from '@/components/pixie/service/ServicePage';
import { getService } from '@/lib/pixieServices';

export const metadata: Metadata = {
  title: 'Omnichannel AI — One Flow for Every Channel | Pixie',
  description:
    'Pixie brings WhatsApp, web chat, Instagram, Messenger, and customer conversations into one smarter flow. Start your channel setup.',
  alternates: { canonical: 'https://www.pixiebot.co/omnichannel-ai' },
};

export default function Page() {
  return <ServicePage config={getService('omnichannel-ai')!} />;
}
