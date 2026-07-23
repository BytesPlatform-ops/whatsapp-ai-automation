'use client';

import { PenLine } from 'lucide-react';
import { CONTENT_ACCENT } from './contentTabs';

/** Page shell for the Content Agent surfaces. Section navigation lives in the
 *  sidebar submenu (CONTENT_NAV), so no in-page tab bar is rendered here. */
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

      <div className="mt-8">{children}</div>
    </main>
  );
}
