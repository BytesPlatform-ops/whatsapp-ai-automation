import type { Metadata } from 'next';
import { TestLab } from '@/components/testlab/TestLab';

export const metadata: Metadata = {
  title: 'Pixie Test Lab',
  description: 'Internal — run every agent workflow against mock/open-source connectors. No real customer action is executed.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <TestLab />;
}
