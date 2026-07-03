'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  User, Settings, KeyRound, CreditCard, Building2, Bell, LifeBuoy, Check, Loader2,
  Mail, ShieldCheck, Save, type LucideIcon,
} from 'lucide-react';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';

/**
 * ProfileView — the in-Lab account overview. Account name/details persist via
 * /api/profile; change-password uses Supabase; billing / workspace / notifications
 * link out to their dedicated (fully wired) pages.
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
        <AccountForm email={email} />
      </Section>

      <Section id="password" icon={KeyRound} title="Change password" subtitle="Update the password you use to sign in.">
        <ChangePassword />
      </Section>

      <Section id="billing" icon={CreditCard} title="Billing / Plan" subtitle="Your current plan and usage.">
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13.5px] text-[var(--pl-text-soft)]">Manage your plan, invoices and payment method on the billing page.</p>
          <a href="/pixie-lab/billing" className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#22C55E] to-[#0EA5A3] px-4 py-2.5 text-[13.5px] font-bold text-white transition hover:brightness-110">Open billing</a>
        </div>
      </Section>

      <Section id="workspace" icon={Building2} title="Workspace settings" subtitle="Your connected workspace.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Workspace" defaultValue={tenant} />
          <Field label="Role" defaultValue={role} />
        </div>
        <a href="/pixie-lab/workspace-settings" className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--pl-green-dark)]">Manage team &amp; permissions →</a>
      </Section>

      <Section id="notifications" icon={Bell} title="Notifications" subtitle="Choose what Pixie emails you about.">
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13.5px] text-[var(--pl-text-soft)]">Set which emails Pixie sends you.</p>
          <a href="/pixie-lab/notifications" className="inline-flex items-center justify-center rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-2.5 text-[13.5px] font-semibold text-[var(--pl-text)] transition hover:border-[var(--pl-border-strong)]">Manage notifications</a>
        </div>
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

const fieldCls = 'mt-1.5 w-full rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3.5 py-2.5 text-[14px] text-[var(--pl-text)] outline-none transition read-only:opacity-70 disabled:opacity-60 focus:border-[var(--pl-green)]';

/** Editable, persisted account form (profiles table via /api/profile). */
function AccountForm({ email }: { email: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: '', roleTitle: '', phone: '', timezone: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/profile', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.profile) setForm({
          fullName: d.profile.fullName ?? '', roleTitle: d.profile.roleTitle ?? '',
          phone: d.profile.phone ?? '', timezone: d.profile.timezone ?? '',
        });
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setToast(null);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setToast(null);
    if (!form.fullName.trim()) { setToast({ ok: false, msg: 'Please enter your name.' }); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error(String(r.status));
      setToast({ ok: true, msg: 'Profile saved.' });
      router.refresh(); // re-fetch server data so the header greeting updates
    } catch {
      setToast({ ok: false, msg: 'Could not save right now. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-[12.5px] font-semibold text-[var(--pl-text-muted)]">Full name</span>
          <input value={form.fullName} onChange={set('fullName')} disabled={loading} placeholder="Your name" className={fieldCls} />
        </label>
        <label className="block">
          <span className="text-[12.5px] font-semibold text-[var(--pl-text-muted)]">Email</span>
          <input value={email} readOnly className={fieldCls} />
          <span className="mt-1 block text-[12px] text-[var(--pl-text-muted)]">Contact support to change your sign-in email.</span>
        </label>
        <label className="block">
          <span className="text-[12.5px] font-semibold text-[var(--pl-text-muted)]">Role / title</span>
          <input value={form.roleTitle} onChange={set('roleTitle')} disabled={loading} placeholder="e.g. Owner, Marketing Lead" className={fieldCls} />
        </label>
        <label className="block">
          <span className="text-[12.5px] font-semibold text-[var(--pl-text-muted)]">Phone</span>
          <input value={form.phone} onChange={set('phone')} disabled={loading} placeholder="Optional" className={fieldCls} />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-[12.5px] font-semibold text-[var(--pl-text-muted)]">Timezone</span>
          <input value={form.timezone} onChange={set('timezone')} disabled={loading} placeholder="e.g. America/New_York" className={fieldCls} />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={busy || loading} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#22C55E] to-[#0EA5A3] px-4 py-2.5 text-[13.5px] font-bold text-white transition hover:brightness-110 disabled:opacity-60">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save changes
        </button>
        {toast && (
          <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${toast.ok ? 'text-[var(--pl-green-dark)]' : 'text-[#ef4444]'}`}>
            {toast.ok && <Check size={14} />} {toast.msg}
          </span>
        )}
      </div>
    </form>
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

