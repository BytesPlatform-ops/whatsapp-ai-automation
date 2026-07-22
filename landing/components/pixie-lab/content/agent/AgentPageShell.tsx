'use client';

import { PenLine } from 'lucide-react';
import { ServiceTabs } from '@/components/pixie-lab/services/ServiceTabs';
import { CONTENT_TABS, CONTENT_ACCENT } from './contentTabs';

/** Page shell for the Content Agent surfaces — matching the media workspace
 *  header + shared Content sub-navigation, so users can move between written
 *  content, media and the AI Influencer without leaving the layout. */
export function AgentPageShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-4xl px-[clamp(20px,4vw,52px)] py-9 text-[var(--pl-text)]">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--pl-border)]" style={{ background: `${CONTENT_ACCENT}1a`, color: CONTENT_ACCENT }}>
          <PenLine size={20} />
        </span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--pl-text-muted)]">Content Agent</p>
          <h1 className="font-display text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-tight tracking-tight">{title}</h1>
        </div>
      </div>
      <p className="mt-1.5 text-[13.5px] text-[var(--pl-text-muted)]">{subtitle}</p>

      <ServiceTabs tabs={CONTENT_TABS} accent={CONTENT_ACCENT} />

      <div className="mt-6">{children}</div>
    </main>
  );
}
