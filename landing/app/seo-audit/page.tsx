import type { Metadata } from 'next';
import { ServicePage } from '@/components/pixie/service/ServicePage';
import { getService } from '@/lib/pixieServices';

export const metadata: Metadata = {
  title: 'SEO & Growth Audit — Plain-English Site Fixes | Pixie',
  description:
    'Pixie turns website, speed, SEO, and visibility issues into simple next steps your business can act on. Start your growth audit.',
  alternates: { canonical: 'https://www.pixiebot.co/seo-audit' },
};

export default function Page() {
  return <ServicePage config={getService('seo-audit')!} />;
}
