'use client';

import { useState } from 'react';
import {
  User, Settings, KeyRound, CreditCard, Building2, Bell, LifeBuoy, Check, Loader2,
  Mail, ShieldCheck, type LucideIcon,
} from 'lucide-react';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';

/**
 * ProfileView — the in-Lab account/settings surface. Sections are anchored to
 * match the ProfileMenu links (#account, #password, #billing, #workspace,
 * #notifications, #help). Change-password is wired to Supabase when configured;
 * other surfaces are clean UI with TODOs where a backend isn't wired yet.
 */
export function ProfileView({ name, email, tenant, role }: { name: string; email: string; tenant: string; role: string }) {
  const initial = (name || 'P').charAt(0).toUpperCase();

  return (
    <main className="mx-auto w-full max-w-4xl px-[clamp(20px,4vw,52px)] py-9">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--pl-text-muted)]">Account</p>
      <h1 className="mt-2 font-display text-[clamp(1.7rem,3vw,2.2rem)] font-extrabold tracking-tight">Profile &amp; settings</h1>

      {/* Identity header */}
      <div className="mt-6 flex flex-col gap-4 rounded-3xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-6 shadow-[var(--pl-shadow-sm)] sm:flex-row sm:items-center">
        <span className="grid h-16 w-16 flex-none place-items-center rounded-2xl bg-gradient-to-br from-[#22C55E] to-[#0EA5A3] text-2xl font-extrabold text-white shadow-[0_10px_26px_-12px_rgba(34,197,94,0.8)]">{initial}</span>
        <div className="min-w-0">
          <h2 className="font-display text-xl font-extrabold tracking-tight">{name || 'Your account'}</h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-[13.5px] text-[var(--pl-text-muted)]"><Mail size={14} /> {email || 'No email on file'}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--pl-green)_30%,var(--pl-border))] bg-[var(--pl-green-soft)] px-2.5 py-1 text-[11.5px] font-bold text-[var(--pl-green-dark)]"><ShieldCheck size={12} /> {role}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--pl-text-muted)]"><Building2 size={12} /> {tenant}</span>
          </div>
        </div>
      </div>

      <Section id="account" icon={Settings} title="Account settings" subtitle="Your basic profile details.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" defaultValue={name} />
          <Field label="Email" defaultValue={email} type="email" hint="Contact support to change your sign-in email." />
        </div>
        {/* TODO: persist name via supabase.auth.updateUser({ data: { name } }). */}
        <p className="mt-3 text-[12.5px] text-[var(--pl-text-muted)]">Profile edits will sync to your workspace. (Saving is not wired yet.)</p>
      </Section>

      <Section id="password" icon={KeyRound} title="Change password" subtitle="Update the password you use to sign in.">
        <ChangePassword />
      </Section>

      <Section id="billing" icon={CreditCard} title="Billing / Plan" subtitle="Your current plan and usage.">
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-[15px] font-bold">Free — Pixie Lab</p>
            <p className="mt-0.5 text-[13px] text-[var(--pl-text-muted)]">All agents free to switch on while in early access.</p>
          </div>
          <button className="inline-flex items-center justify-center rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-2.5 text-[13.5px] font-semibold text-[var(--pl-text-muted)]" disabled title="Billing coming soon">
            Manage plan (soon)
          </button>
        </div>
        {/* TODO: wire to billing provider when plans launch. */}
      </Section>

      <Section id="workspace" icon={Building2} title="Workspace settings" subtitle="Your connected workspace.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Workspace" defaultValue={tenant} />
          <Field label="Role" defaultValue={role} />
        </div>
      </Section>

      <Section id="notifications" icon={Bell} title="Notifications" subtitle="Choose what Pixie emails you about.">
        <Toggles />
      </Section>

      <Section id="help" icon={LifeBuoy} title="Help &amp; support" subtitle="We're here if you need a hand.">
        <div className="flex flex-wrap gap-3">
          <a href="mailto:bytesuite@bytesplatform.com" className="inline-flex items-center gap-2 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-4 py-2.5 text-[13.5px] font-semibold text-[var(--pl-text)] transition hover:border-[var(--pl-border-strong)]">
            <Mail size={15} /> Email support
          </a>
        </div>
      </Section>
    </main>
  );
}

function Section({ id, icon: Icon, title, subtitle, children }: { id: string; icon: LucideIcon; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-6 scroll-mt-24 rounded-3xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-6 shadow-[var(--pl-shadow-sm)]">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--pl-surface-soft)] text-[var(--pl-green)]"><Icon size={17} /></span>
        <div>
          <h3 className="font-display text-[1.05rem] font-extrabold tracking-tight">{title}</h3>
          <p className="text-[13px] text-[var(--pl-text-muted)]">{subtitle}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Field({ label, defaultValue, type = 'text', hint }: { label: string; defaultValue?: string; type?: string; hint?: string }) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-semibold text-[var(--pl-text-muted)]">{label}</span>
      <input
        type={type}
        defaultValue={defaultValue}
        className="mt-1.5 w-full rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3.5 py-2.5 text-[14px] text-[var(--pl-text)] outline-none transition focus:border-[var(--pl-green)]"
      />
      {hint && <span className="mt-1 block text-[12px] text-[var(--pl-text-muted)]">{hint}</span>}
    </label>
  );
}

function ChangePassword() {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    if (pw.length < 8) { setStatus({ ok: false, msg: 'Use at least 8 characters.' }); return; }
    if (pw !== confirm) { setStatus({ ok: false, msg: 'Passwords do not match.' }); return; }
    if (!supabaseConfigured()) { setStatus({ ok: false, msg: 'Sign-in is not configured in this environment.' }); return; }
    setBusy(true);
    try {
      const { error } = await createClient().auth.updateUser({ password: pw });
      if (error) setStatus({ ok: false, msg: error.message });
      else { setStatus({ ok: true, msg: 'Password updated.' }); setPw(''); setConfirm(''); }
    } catch {
      setStatus({ ok: false, msg: 'Something went wrong. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <label className="block">
        <span className="text-[12.5px] font-semibold text-[var(--pl-text-muted)]">New password</span>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password"
          className="mt-1.5 w-full rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3.5 py-2.5 text-[14px] text-[var(--pl-text)] outline-none transition focus:border-[var(--pl-green)]" />
      </label>
      <label className="block">
        <span className="text-[12.5px] font-semibold text-[var(--pl-text-muted)]">Confirm password</span>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
          className="mt-1.5 w-full rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3.5 py-2.5 text-[14px] text-[var(--pl-text)] outline-none transition focus:border-[var(--pl-green)]" />
      </label>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#22C55E] to-[#0EA5A3] px-4 py-2.5 text-[13.5px] font-bold text-white transition hover:brightness-110 disabled:opacity-60">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Update password
        </button>
        {status && (
          <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${status.ok ? 'text-[var(--pl-green-dark)]' : 'text-[#ef4444]'}`}>
            {status.ok && <Check size={14} />} {status.msg}
          </span>
        )}
      </div>
    </form>
  );
}

const PREFS = [
  { key: 'leads', label: 'New leads & messages', desc: 'When a customer reaches out or a lead comes in.' },
  { key: 'approvals', label: 'Approvals waiting', desc: 'When Pixie needs your sign-off on something.' },
  { key: 'weekly', label: 'Weekly summary', desc: 'A digest of what Pixie did for your business.' },
  { key: 'product', label: 'Product updates', desc: 'New agents and features as they launch.' },
];

function Toggles() {
  // Local-only for now. TODO: persist to user preferences when the API exists.
  const [on, setOn] = useState<Record<string, boolean>>({ leads: true, approvals: true, weekly: true, product: false });
  return (
    <div className="divide-y divide-[var(--pl-border)]">
      {PREFS.map((p) => (
        <div key={p.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
          <div>
            <p className="text-[14px] font-semibold text-[var(--pl-text)]">{p.label}</p>
            <p className="text-[12.5px] text-[var(--pl-text-muted)]">{p.desc}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={on[p.key]}
            onClick={() => setOn((s) => ({ ...s, [p.key]: !s[p.key] }))}
            className="relative h-6 w-11 flex-none rounded-full transition-colors"
            style={{ background: on[p.key] ? 'var(--pl-green)' : 'var(--pl-border-strong)' }}
          >
            <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left]" style={{ left: on[p.key] ? '22px' : '2px' }} />
          </button>
        </div>
      ))}
    </div>
  );
}
