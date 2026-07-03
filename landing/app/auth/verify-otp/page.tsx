import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/AuthShell';
import { OtpVerify } from '@/components/auth/OtpVerify';

export const metadata: Metadata = {
  title: 'Verify your email — Pixie',
  description: 'Enter the 6-digit code we emailed you to finish creating your Pixie account.',
  robots: { index: false, follow: false },
};

function OtpFromParams({ searchParams }: { searchParams: { email?: string; next?: string; agent?: string } }) {
  const email = searchParams.email ?? '';
  const next = searchParams.next && searchParams.next.startsWith('/') && !searchParams.next.startsWith('//')
    ? searchParams.next
    : '/pixie-lab/dashboard';
  return <OtpVerify email={email} next={next} agent={searchParams.agent} />;
}

export default function VerifyOtpPage({ searchParams }: { searchParams: { email?: string; next?: string; agent?: string } }) {
  return (
    <AuthShell
      eyebrow="Almost there"
      title="Verify your email"
      subtitle="We emailed you a 6-digit code — pop it in to activate your account."
      altPrompt="Already verified?"
      altHref="/login"
      altLabel="Sign in"
    >
      <Suspense fallback={null}>
        <OtpFromParams searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}
