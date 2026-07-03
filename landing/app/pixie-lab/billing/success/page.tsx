import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { PageContainer, PageHeader, BackToDashboard } from '@/components/pixie-lab/PageKit';

export const metadata: Metadata = { title: 'Subscription active — Pixie Lab', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default function BillingSuccessPage() {
  return (
    <PageContainer narrow>
      <PageHeader eyebrow="Billing" title="You're all set" />
      <div className="mt-6 rounded-3xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-8 text-center shadow-[var(--pl-shadow-sm)]">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-[#22C55E] to-[#0EA5A3] text-white shadow-[0_14px_30px_-12px_rgba(34,197,94,0.7)]">
          <CheckCircle2 size={30} />
        </span>
        <h2 className="mt-4 font-display text-xl font-extrabold tracking-tight">Subscription activated</h2>
        <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-[var(--pl-text-muted)]">
          Thanks! Your plan is being confirmed — it&apos;ll appear on your billing page in a moment.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/pixie-lab/billing" className="inline-flex items-center rounded-xl bg-gradient-to-r from-[#22C55E] to-[#0EA5A3] px-4 py-2.5 text-[13.5px] font-bold text-white transition hover:brightness-110">View billing</Link>
          <BackToDashboard />
        </div>
      </div>
    </PageContainer>
  );
}
