import type { Metadata } from 'next';
import { ServicesDashboard } from '@/components/pixie/dashboard/ServicesDashboard';

export const metadata: Metadata = {
  title: 'Your Services — Pixie Dashboard',
  description:
    'Every Pixie service in one place. Pick a mode — AI receptionist, website builder, social content, SEO audit, and more — and see exactly what Pixie needs from you to start.',
  alternates: { canonical: 'https://www.pixiebot.co/dashboard' },
  robots: { index: false, follow: false },
};

export default function Page({
  searchParams,
}: {
  searchParams: { tenant?: string };
}) {
  return <ServicesDashboard tenant={searchParams.tenant || 'demo'} />;
}
