import type { Metadata } from 'next';
import { ServicePage } from '@/components/pixie/service/ServicePage';
import { getService } from '@/lib/pixieServices';

export const metadata: Metadata = {
  title: 'AI Website Builder — Branded Site Direction Fast | Pixie',
  description:
    'Tell Pixie what your business does and get a branded website direction without waiting weeks for the first draft. Start your website build.',
  alternates: { canonical: 'https://www.pixiebot.co/website-builder' },
};

export default function Page() {
  return <ServicePage config={getService('website-builder')!} />;
}
