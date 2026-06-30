import { Suspense } from 'react';
import type { Metadata } from 'next';
import { VerifyEmailCard } from '@/components/auth/VerifyEmailCard';

export const metadata: Metadata = {
  title: 'Verify your email — Pixie',
  description: 'Confirm your email to unlock your Pixie dashboard.',
  robots: { index: false, follow: false },
};

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailCard />
    </Suspense>
  );
}
