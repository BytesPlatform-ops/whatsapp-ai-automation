import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthForm } from '@/components/auth/AuthForm';

export const metadata: Metadata = {
  title: 'Sign in — Pixie',
  description: 'Sign in to your Pixie dashboard.',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to Pixie"
      subtitle="Pick up where you left off across every service."
      altPrompt="New to Pixie?"
      altHref="/register"
      altLabel="Create an account"
    >
      <Suspense fallback={null}>
        <AuthForm mode="login" />
      </Suspense>
    </AuthShell>
  );
}
