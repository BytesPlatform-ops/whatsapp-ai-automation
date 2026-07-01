'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Settings, KeyRound, CreditCard, Building2, Bell, LifeBuoy, ShieldCheck, Mail,
  Sun, Moon, Monitor, Check, Loader2, MessageCircle, FileWarning, BookOpen, Users, Shield,
} from 'lucide-react';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';
import { useTheme } from './theme/ThemeProvider';
import { PageContainer, PageHeader, SettingsCard, Field } from './PageKit';

/* ── Account Settings ─────────────────────────────────────────────────────── */
export function SettingsView({ name, email, tenant }: { name: string; email: string; tenant: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <PageContainer narrow>
      <PageHeader eyebrow="Account" title="Settings" description="Manage your general account and workspace preferences." />

      <SettingsCard icon={Settings} title="General" subtitle="Your basic profile details.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" value={name} />
          <Field label="Email" value={email} type="email" hint="Contact support to change your sign-in email." />
        </div>
        {/* TODO: persist via supabase.auth.updateUser({ data: { name } }) */}
      </SettingsCard>

      <SettingsCard icon={Sun} title="Theme preference" subtitle="Choose how Pixie Lab looks. Saved automatically.">
        <div className="flex flex-wrap gap-2">
          {([['light', 'Light', Sun], ['dark', 'Dark', Moon], ['system', 'System', Monitor]] as const).map(([val, label, Icon]) => {
            const active = val === 'system' ? false : theme === val;
            return (
              <button
                key={val}
                onClick={() => { if (val !== 'system') setTheme(val); }}
                disabled={val === 'system'}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13.5px] font-semibold transition disabled:opacity-50"
                style={{
                  borderColor: active ? 'color-mix(in srgb, var(--pl-green) 45%, var(--pl-border))' : 'var(--pl-border)',
                  background: active ? 'var(--pl-green-soft)' : 'var(--pl-surface-soft)',
                  color: active ? 'var(--pl-green-dark)' : 'var(--pl-text-soft)',
                }}
              >
                <Icon size={15} /> {label}{val === 'system' ? ' (soon)' : ''}
              </button>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard icon={Building2} title="Workspace" subtitle="The workspace these settings apply to.">
        <Field label="Workspace" value={tenant} readOnly />
      </SettingsCard>

      <SettingsCard icon={Bell} title="Notifications" subtitle="Manage what Pixie emails you about."
        action={<Link href="/pixie-lab/notifications" className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3.5 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]">Manage</Link>}
      />
    </PageContainer>
  );
}

/* ── Security ─────────────────────────────────────────────────────────────── */
export function SecurityView() {
  return (
    <PageContainer narrow>
      <PageHeader eyebrow="Account" title="Security" description="Keep your account safe." />
      <SettingsCard icon={KeyRound} title="Change password" subtitle="Update the password you use to sign in.">
        <ChangePassword />
      </SettingsCard>
      <SettingsCard icon={ShieldCheck} title="Two-factor authentication" subtitle="Add an extra layer of protection.">
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13.5px] text-[var(--pl-text-soft)]">2FA is not enabled on your account yet.</p>
          <button disabled className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-2.5 text-[13px] font-semibold text-[var(--pl-text-muted)]" title="Coming soon">Enable 2FA (soon)</button>
        </div>
        {/* TODO: wire 2FA when auth supports it */}
      </SettingsCard>
      <SettingsCard icon={Monitor} title="Active sessions" subtitle="Devices currently signed in.">
        <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4 text-[13.5px] text-[var(--pl-text-muted)]">
          This device · active now. <span className="opacity-70">Full session management is coming soon.</span>
        </div>
        {/* TODO: list real sessions via supabase */}
      </SettingsCard>
    </PageContainer>
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
    if (pw.length < 8) return setStatus({ ok: false, msg: 'Use at least 8 characters.' });
    if (pw !== confirm) return setStatus({ ok: false, msg: 'Passwords do not match.' });
    if (!supabaseConfigured()) return setStatus({ ok: false, msg: 'Sign-in is not configured in this environment.' });
    setBusy(true);
    try {
      const { error } = await createClient().auth.updateUser({ password: pw });
      if (error) setStatus({ ok: false, msg: error.message });
      else { setStatus({ ok: true, msg: 'Password updated.' }); setPw(''); setConfirm(''); }
    } catch { setStatus({ ok: false, msg: 'Something went wrong. Please try again.' }); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <label className="block">
        <span className="text-[12.5px] font-semibold text-[var(--pl-text-muted)]">New password</span>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" className="mt-1.5 w-full rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3.5 py-2.5 text-[14px] text-[var(--pl-text)] outline-none focus:border-[var(--pl-green)]" />
      </label>
      <label className="block">
        <span className="text-[12.5px] font-semibold text-[var(--pl-text-muted)]">Confirm password</span>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" className="mt-1.5 w-full rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3.5 py-2.5 text-[14px] text-[var(--pl-text)] outline-none focus:border-[var(--pl-green)]" />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#22C55E] to-[#0EA5A3] px-4 py-2.5 text-[13.5px] font-bold text-white transition hover:brightness-110 disabled:opacity-60">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Update password
        </button>
        {status && <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${status.ok ? 'text-[var(--pl-green-dark)]' : 'text-[#ef4444]'}`}>{status.ok && <Check size={14} />} {status.msg}</span>}
      </div>
    </form>
  );
}

/* ── Billing ──────────────────────────────────────────────────────────────── */
export function BillingView() {
  return (
    <PageContainer narrow>
      <PageHeader eyebrow="Account" title="Billing & plan" description="Your current plan, trial and invoices." />
      <SettingsCard icon={CreditCard} title="Current plan"
        action={<span className="rounded-full border border-[color-mix(in_srgb,var(--pl-green)_30%,var(--pl-border))] bg-[var(--pl-green-soft)] px-2.5 py-1 text-[11.5px] font-bold text-[var(--pl-green-dark)]">Early access</span>}
      >
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-[15px] font-bold">Free — Pixie Lab</p>
            <p className="mt-0.5 text-[13px] text-[var(--pl-text-muted)]">All agents free to switch on during early access · 14 trial days left.</p>
          </div>
          <button className="rounded-xl bg-gradient-to-r from-[#22C55E] to-[#0EA5A3] px-4 py-2.5 text-[13.5px] font-bold text-white transition hover:brightness-110" title="Upgrade coming soon">Upgrade plan</button>
        </div>
        {/* TODO: wire to billing provider when plans launch */}
      </SettingsCard>
      <SettingsCard icon={FileWarning} title="Billing history" subtitle="Invoices and receipts.">
        <div className="rounded-2xl border border-dashed border-[var(--pl-border-strong)] bg-[var(--pl-surface-soft)] p-6 text-center text-[13.5px] text-[var(--pl-text-muted)]">No invoices yet — you&apos;re on the free early-access plan.</div>
      </SettingsCard>
    </PageContainer>
  );
}

/* ── Workspace settings ───────────────────────────────────────────────────── */
export function WorkspaceSettingsView({ tenant }: { tenant: string }) {
  return (
    <PageContainer narrow>
      <PageHeader eyebrow="Workspace" title="Workspace settings" description="Manage your workspace details and team." />
      <SettingsCard icon={Building2} title="Details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Workspace name" value={tenant} />
          <Field label="Workspace ID" value={tenant} readOnly />
        </div>
      </SettingsCard>
      <SettingsCard icon={Users} title="Members" subtitle="People with access to this workspace.">
        <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4 text-[13.5px] text-[var(--pl-text-muted)]">You&apos;re the only member. <span className="opacity-70">Inviting teammates is coming soon.</span></div>
        {/* TODO: members list + invite flow */}
      </SettingsCard>
      <SettingsCard icon={Shield} title="Permissions" subtitle="Control what members can do.">
        <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4 text-[13.5px] text-[var(--pl-text-muted)]">Role-based permissions will appear here once team members are supported.</div>
      </SettingsCard>
    </PageContainer>
  );
}

/* ── Notifications ────────────────────────────────────────────────────────── */
const PREFS = [
  { key: 'leads', label: 'New leads & messages', desc: 'When a customer reaches out or a lead comes in.' },
  { key: 'approvals', label: 'Approvals waiting', desc: 'When Pixie needs your sign-off on something.' },
  { key: 'weekly', label: 'Weekly summary', desc: 'A digest of what Pixie did for your business.' },
  { key: 'product', label: 'Product updates', desc: 'New agents and features as they launch.' },
];
export function NotificationsView() {
  const [on, setOn] = useState<Record<string, boolean>>({ leads: true, approvals: true, weekly: true, product: false });
  return (
    <PageContainer narrow>
      <PageHeader eyebrow="Account" title="Notifications" description="Choose what Pixie emails you about." />
      <SettingsCard icon={Bell} title="Email preferences">
        <div className="divide-y divide-[var(--pl-border)]">
          {PREFS.map((p) => (
            <div key={p.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div>
                <p className="text-[14px] font-semibold text-[var(--pl-text)]">{p.label}</p>
                <p className="text-[12.5px] text-[var(--pl-text-muted)]">{p.desc}</p>
              </div>
              <button type="button" role="switch" aria-checked={on[p.key]} onClick={() => setOn((s) => ({ ...s, [p.key]: !s[p.key] }))}
                className="relative h-6 w-11 flex-none rounded-full transition-colors" style={{ background: on[p.key] ? 'var(--pl-green)' : 'var(--pl-border-strong)' }}>
                <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left]" style={{ left: on[p.key] ? '22px' : '2px' }} />
              </button>
            </div>
          ))}
        </div>
        {/* TODO: persist preferences when a notifications API exists */}
      </SettingsCard>
    </PageContainer>
  );
}

/* ── Support ──────────────────────────────────────────────────────────────── */
export function SupportView() {
  const cards = [
    { icon: BookOpen, title: 'Help center', desc: 'Guides and answers to common questions.', cta: 'Browse guides', href: '#' },
    { icon: MessageCircle, title: 'Contact support', desc: 'Reach the Pixie team by email.', cta: 'Email support', href: 'mailto:bytesuite@bytesplatform.com' },
    { icon: FileWarning, title: 'Report an issue', desc: 'Something broken? Let us know.', cta: 'Report issue', href: 'mailto:bytesuite@bytesplatform.com?subject=Pixie%20Lab%20issue' },
  ];
  return (
    <PageContainer>
      <PageHeader eyebrow="Account" title="Help & support" description="We're here if you need a hand." />
      <div className="mt-6 grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <a key={c.title} href={c.href} className="group flex flex-col rounded-3xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5 shadow-[var(--pl-shadow-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--pl-shadow)]">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--pl-surface-soft)] text-[var(--pl-green)]"><Icon size={20} /></span>
              <h3 className="mt-3 font-display text-[1.02rem] font-bold tracking-tight">{c.title}</h3>
              <p className="mt-1 text-[13px] text-[var(--pl-text-muted)]">{c.desc}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--pl-green-dark)]"><Mail size={14} /> {c.cta}</span>
            </a>
          );
        })}
      </div>
    </PageContainer>
  );
}
