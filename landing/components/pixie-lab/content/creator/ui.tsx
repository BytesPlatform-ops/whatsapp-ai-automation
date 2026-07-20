'use client';

/** Shared, accessible primitives for the Content Creator wizard steps. Uses the
 *  Pixie Lab `--pl-*` design tokens so it matches the rest of the Lab. */

import { AlertTriangle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import type { CreatorError } from '@/lib/pixie-lab/contentCreatorClient';

export function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'muted' | 'info'; children: React.ReactNode }) {
  const colors =
    tone === 'ok' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
    : tone === 'warn' ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
    : tone === 'info' ? 'border-sky-500/30 bg-sky-500/10 text-sky-500'
    : 'border-[var(--pl-border)] bg-[var(--pl-surface-soft)] text-[var(--pl-text-soft)]';
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${colors}`}>{children}</span>;
}

export function MockBadge({ mock, dryRun }: { mock: boolean; dryRun: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {mock ? <Badge tone="warn"><Sparkles className="h-3 w-3" aria-hidden /> Demo · Mock mode</Badge> : <Badge tone="ok">Live provider</Badge>}
      {dryRun ? <Badge tone="muted">Dry-run publishing</Badge> : null}
    </div>
  );
}

export function StepCard({ title, description, children, footer }: {
  title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5 sm:p-6" aria-label={title}>
      <h2 className="text-lg font-semibold text-[var(--pl-text)]">{title}</h2>
      {description ? <p className="mt-1 text-sm text-[var(--pl-text-soft)]">{description}</p> : null}
      <div className="mt-4">{children}</div>
      {footer ? <div className="mt-5 flex flex-wrap items-center gap-3">{footer}</div> : null}
    </section>
  );
}

export function ErrorNote({ error }: { error: CreatorError | { message: string } | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> <span>{error.message}</span>
    </p>
  );
}

export function PrimaryButton({ busy, disabled, onClick, children, type = 'button' }: {
  busy?: boolean; disabled?: boolean; onClick?: () => void; children: React.ReactNode; type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={busy || disabled}
      aria-busy={busy}
      className="inline-flex items-center gap-2 rounded-full bg-[var(--pl-accent,#D4AF37)] px-4 py-2 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function GhostButton({ onClick, disabled, children }: { onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-full border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-4 py-2 text-sm font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)] disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function DoneRow({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm font-medium text-emerald-500">
      <CheckCircle2 className="h-4 w-4" aria-hidden /> {label}
    </p>
  );
}

export function TextField({ id, label, value, onChange, placeholder, required, textarea, hint }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; textarea?: boolean; hint?: string;
}) {
  const cls = 'mt-1 w-full rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-sm text-[var(--pl-text)] outline-none focus:border-[var(--pl-accent,#D4AF37)]';
  return (
    <label htmlFor={id} className="block text-sm">
      <span className="font-medium text-[var(--pl-text)]">{label}{required ? <span className="text-red-500" aria-hidden> *</span> : null}</span>
      {textarea
        ? <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={4} className={cls} />
        : <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />}
      {hint ? <span className="mt-1 block text-xs text-[var(--pl-text-soft)]">{hint}</span> : null}
    </label>
  );
}

/** Render possibly multi-line generated text safely (never dangerouslySetInnerHTML). */
export function TextBlock({ text }: { text: string }) {
  return <p className="whitespace-pre-wrap break-words text-sm text-[var(--pl-text)]">{text}</p>;
}
