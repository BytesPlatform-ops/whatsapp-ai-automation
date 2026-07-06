'use client';

import { AlertTriangle, PlugZap, Inbox, ServerCrash, type LucideIcon } from 'lucide-react';

/**
 * Shared empty / error / setup / offline states for service tool pages, all
 * theme-aware via --pl-* tokens so SEO, Marketing and Content look consistent.
 */

function Panel({ icon: Icon, tone, title, body, action }: { icon: LucideIcon; tone: string; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--pl-border)] bg-[var(--pl-surface)] px-6 py-12 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl" style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}>
        <Icon size={24} />
      </span>
      <p className="mt-4 font-display text-[1.05rem] font-extrabold tracking-tight text-[var(--pl-text)]">{title}</p>
      {body && <p className="mx-auto mt-1.5 max-w-md text-[13.5px] leading-relaxed text-[var(--pl-text-muted)]">{body}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return <Panel icon={Inbox} tone="#94a3b8" title={title} body={body} action={action} />;
}

export function ErrorState({ title = 'Something went wrong', body, action }: { title?: string; body?: string; action?: React.ReactNode }) {
  return <Panel icon={AlertTriangle} tone="#f59e0b" title={title} body={body} action={action} />;
}

/** Backend/service unreachable — distinct from a config problem. */
export function OfflineState({ service = 'service', action }: { service?: string; action?: React.ReactNode }) {
  return (
    <Panel
      icon={ServerCrash}
      tone="#ef4444"
      title={`The ${service} service is offline`}
      body="We couldn't reach the Pixie backend. Make sure it's running (uvicorn app:app --port 8000), then retry."
      action={action}
    />
  );
}

/** Integration keys missing — an admin needs to finish setup. */
export function SetupRequired({ title = 'Setup required', body, action }: { title?: string; body?: string; action?: React.ReactNode }) {
  return <Panel icon={PlugZap} tone="var(--pl-green)" title={title} body={body} action={action} />;
}

export function LoadingCards({ count = 3, height = 'h-24' }: { count?: number; height?: string }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`${height} animate-pulse rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)]`} />
      ))}
    </div>
  );
}
