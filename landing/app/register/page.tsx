import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthForm } from '@/components/auth/AuthForm';

export const metadata: Metadata = {
  title: 'Create your account — Pixie',
  description: 'Create a Pixie account to access every AI service in one dashboard.',
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return (
    <AuthShell
      eyebrow="Get started"
      title="Create your account"
      subtitle="One login for your receptionist, website, SEO, content & more."
      altPrompt="Already have an account?"
      altHref="/login"
      altLabel="Sign in"
    >
      <Suspense fallback={null}>
        <AuthForm mode="register" />
      </Suspense>
    </AuthShell>
  );
}
