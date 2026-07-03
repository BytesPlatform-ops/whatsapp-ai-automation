import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/AuthShell';
import { AcceptInvite } from '@/components/auth/AcceptInvite';

export const metadata: Metadata = { title: 'Accept invitation — Pixie', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default function AcceptInvitePage({ searchParams }: { searchParams: { token?: string } }) {
  return (
    <AuthShell
      eyebrow="You're invited"
      title="Join the workspace"
      subtitle="Accept your invitation to start collaborating in Pixie Lab."
      altPrompt="Not you?"
      altHref="/login"
      altLabel="Sign in"
    >
      <Suspense fallback={null}>
        <AcceptInvite token={searchParams.token ?? ''} />
      </Suspense>
    </AuthShell>
  );
}
