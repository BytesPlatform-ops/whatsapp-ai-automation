import type { Metadata } from 'next';
import { ServicePage } from '@/components/pixie/service/ServicePage';
import { getService } from '@/lib/pixieServices';

export const metadata: Metadata = {
  title: 'AI Receptionist — Never Miss a Lead | Pixie',
  description:
    'Pixie answers questions, captures leads, and keeps conversations moving even when your team is busy. Start your AI receptionist setup.',
  alternates: { canonical: 'https://www.pixiebot.co/ai-receptionist' },
};

export default function Page() {
  return <ServicePage config={getService('ai-receptionist')!} />;
}
