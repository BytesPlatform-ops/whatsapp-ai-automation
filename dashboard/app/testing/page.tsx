import type { Metadata } from 'next';
import { TestingConsole } from '@/components/testing/TestingConsole';

export const metadata: Metadata = {
  title: 'Pixie Testing Console',
  description: 'Internal — test all 5 Pixie bots against the real backend from one place.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <TestingConsole />;
}
