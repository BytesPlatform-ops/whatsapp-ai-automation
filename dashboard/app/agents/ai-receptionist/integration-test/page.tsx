import type { Metadata } from 'next';
import { IntegrationTest } from '@/components/ai-receptionist/IntegrationTest';

export const metadata: Metadata = {
  title: 'AI Receptionist Real Integration Test',
  description:
    'Run the AI Receptionist on a real customer message. OpenAI generates the reply; execution stays mock until a real tool is connected and the action is approved.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <IntegrationTest />;
}
