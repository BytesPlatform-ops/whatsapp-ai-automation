'use client';

import Link from 'next/link';
import { ArrowLeft, Sparkles, Lock, type LucideIcon } from 'lucide-react';

/**
 * PageKit — shared building blocks so every Pixie Lab page uses the same shell
 * rhythm, tokens and spacing: a page container, a PageHeader (eyebrow + title +
 * description), a SettingsCard, and a polished ComingSoonPage. All theme-aware
 * via the --pl-* tokens.
 */

export function PageContainer({ children, narrow }: { children: React.ReactNode; narrow?: boolean }) {
  return (
    <main className={`mx-auto w-full ${narrow ? 'max-w-3xl' : 'max-w-5xl'} px-[clamp(20px,4vw,52px)] py-9 text-[var(--pl-text)]`}>
      {children}
    </main>
  );
}

export function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--pl-text-muted)]">{eyebrow}</p>
      <h1 className="mt-2 font-display text-[clamp(1.7rem,3vw,2.2rem)] font-extrabold leading-tight tracking-tight">{title}</h1>
      {description && <p className="mt-1.5 max-w-xl text-[14.5px] leading-relaxed text-[var(--pl-text-muted)]">{description}</p>}
    </div>
  );
}

export function SettingsCard({ icon: Icon, title, subtitle, children, action }: {
  icon?: LucideIcon; title: string; subtitle?: string; children?: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-3xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-6 shadow-[var(--pl-shadow-sm)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          {Icon && <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-[var(--pl-surface-soft)] text-[var(--pl-green)]"><Icon size={17} /></span>}
          <div>
            <h3 className="font-display text-[1.05rem] font-extrabold tracking-tight">{title}</h3>
            {subtitle && <p className="text-[13px] text-[var(--pl-text-muted)]">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </section>
  );
}

/** A labelled field (read-only display or editable input placeholder). */
export function Field({ label, value, hint, type = 'text', readOnly }: { label: string; value?: string; hint?: string; type?: string; readOnly?: boolean }) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-semibold text-[var(--pl-text-muted)]">{label}</span>
      <input
        type={type}
        defaultValue={value}
        readOnly={readOnly}
        className="mt-1.5 w-full rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3.5 py-2.5 text-[14px] text-[var(--pl-text)] outline-none transition read-only:opacity-70 focus:border-[var(--pl-green)]"
      />
      {hint && <span className="mt-1 block text-[12px] text-[var(--pl-text-muted)]">{hint}</span>}
    </label>
  );
}

export function BackToDashboard({ label = 'Back to Dashboard', href = '/pixie-lab/dashboard' }: { label?: string; href?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-2.5 text-[13.5px] font-semibold text-[var(--pl-text-soft)] transition hover:border-[var(--pl-border-strong)] hover:text-[var(--pl-text)]"
    >
      <ArrowLeft size={15} /> {label}
    </Link>
  );
}

/** In-shell "access restricted" page (RBAC) — never a 404. */
export function AccessRestricted({ what = 'this page' }: { what?: string }) {
  return (
    <PageContainer narrow>
      <PageHeader eyebrow="Restricted" title="Access restricted" />
      <div className="mt-6 rounded-3xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-8 text-center shadow-[var(--pl-shadow-sm)]">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[var(--pl-surface-soft)] text-[var(--pl-text-muted)]">
          <Lock size={28} />
        </span>
        <h2 className="mt-4 font-display text-xl font-extrabold tracking-tight">You don&apos;t have access to {what}</h2>
        <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-[var(--pl-text-muted)]">
          Ask a workspace admin to grant you permission, or head back to your dashboard.
        </p>
        <div className="mt-6 flex justify-center"><BackToDashboard /></div>
      </div>
    </PageContainer>
  );
}

/** A polished in-shell "coming soon" page. */
export function ComingSoonPage({ icon: Icon = Sparkles, eyebrow, title, description, features }: {
  icon?: LucideIcon; eyebrow: string; title: string; description: string; features?: string[];
}) {
  return (
    <PageContainer narrow>
      <PageHeader eyebrow={eyebrow} title={title} />
      <div className="mt-6 overflow-hidden rounded-3xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-8 text-center shadow-[var(--pl-shadow-sm)]">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-[#22C55E] to-[#0EA5A3] text-white shadow-[0_14px_30px_-12px_rgba(34,197,94,0.7)]">
          <Icon size={28} strokeWidth={2} />
        </span>
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--pl-green)_30%,var(--pl-border))] bg-[var(--pl-green-soft)] px-3 py-1 text-[11.5px] font-bold uppercase tracking-wide text-[var(--pl-green-dark)]">
          Coming soon
        </div>
        <h2 className="mt-3 font-display text-xl font-extrabold tracking-tight">{title}</h2>
        <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-[var(--pl-text-muted)]">{description}</p>

        {features && features.length > 0 && (
          <ul className="mx-auto mt-5 grid max-w-md gap-2 text-left sm:grid-cols-2">
            {features.map((f) => (
              <li key={f} className="flex items-center gap-2 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[13px] text-[var(--pl-text-soft)]">
                <span className="h-1.5 w-1.5 flex-none rounded-full bg-[var(--pl-green)]" /> {f}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex justify-center">
          <BackToDashboard />
        </div>
      </div>
    </PageContainer>
  );
}
