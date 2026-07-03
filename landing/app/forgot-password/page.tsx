import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/AuthShell';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export const metadata: Metadata = {
  title: 'Reset your password — Pixie',
  description: 'Get a link to reset your Pixie password.',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Password help"
      title="Reset your password"
      subtitle="Enter your email and we’ll send you a link to set a new password."
      altPrompt="Don’t have an account?"
      altHref="/register"
      altLabel="Create one"
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
