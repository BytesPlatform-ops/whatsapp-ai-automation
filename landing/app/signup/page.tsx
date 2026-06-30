import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/AuthShell';
import { SignupForm } from '@/components/auth/SignupForm';

export const metadata: Metadata = {
  title: 'Start your Pixie setup',
  description: 'Create your Pixie account to start setting up your AI agents. No payment required.',
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return (
    <AuthShell
      eyebrow="Get started"
      title="Start your Pixie setup"
      subtitle="Create your account to continue — no payment required right now."
      altPrompt="Already have an account?"
      altHref="/login"
      altLabel="Sign in"
    >
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
    </AuthShell>
  );
}
