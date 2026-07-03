'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Settings, KeyRound, CreditCard, Building2, Bell, LifeBuoy, ShieldCheck, Mail,
  Sun, Moon, Monitor, Check, Loader2, MessageCircle, FileWarning, BookOpen, Users, Shield, LogOut,
} from 'lucide-react';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';
import { useTheme } from './theme/ThemeProvider';
import { PageContainer, PageHeader, SettingsCard, Field } from './PageKit';
import { TwoFactorSetup } from './TwoFactorSetup';

/* ── Account Settings ─────────────────────────────────────────────────────── */
export function SettingsView({ name, email, tenant }: { name: string; email: string; tenant: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <PageContainer narrow>
      <PageHeader eyebrow="Account" title="Settings" description="Manage your general account and workspace preferences." />

      <SettingsCard icon={Settings} title="General" subtitle="Your basic profile details."
        action={<Link href="/pixie-lab/profile" className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3.5 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]">Edit profile</Link>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" value={name} readOnly />
          <Field label="Email" value={email} type="email" readOnly hint="Edit your name on the Profile page." />
        </div>
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
      <SettingsCard icon={ShieldCheck} title="Two-factor authentication" subtitle="Add an extra layer of protection with an authenticator app.">
        <TwoFactorSetup />
      </SettingsCard>
      <SettingsCard icon={Monitor} title="Active sessions" subtitle="Devices signed in to your account.">
        <ActiveSessions />
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
    if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return setStatus({ ok: false, msg: 'Use at least one letter and one number.' });
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

interface SessionRow { id: string; deviceLabel: string | null; lastSeenAt: string; current: boolean }

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'active now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function ActiveSessions() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch('/api/sessions', { cache: 'no-store' });
      if (r.ok) { const d = await r.json(); setSessions(d.sessions ?? []); }
    } catch { /* */ } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function revoke(id: string, current: boolean) {
    setBusy(id);
    try {
      const r = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: id }) });
      if (r.ok && current) { router.replace('/login'); router.refresh(); return; }
      await load();
    } catch { /* */ } finally { setBusy(null); }
  }

  if (loading) return <div className="flex items-center gap-2 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4 text-[13.5px] text-[var(--pl-text-muted)]"><Loader2 size={15} className="animate-spin" /> Loading sessions…</div>;
  if (sessions.length === 0) return <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4 text-[13.5px] text-[var(--pl-text-muted)]">No active sessions recorded yet.</div>;

  return (
    <div className="divide-y divide-[var(--pl-border)]">
      {sessions.map((s) => (
        <div key={s.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-[var(--pl-surface-soft)] text-[var(--pl-text-muted)]"><Monitor size={16} /></span>
            <div>
              <p className="flex items-center gap-2 text-[14px] font-semibold text-[var(--pl-text)]">
                {s.deviceLabel || 'Unknown device'}
                {s.current && <span className="rounded-full border border-[color-mix(in_srgb,var(--pl-green)_30%,var(--pl-border))] bg-[var(--pl-green-soft)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--pl-green-dark)]">This device</span>}
              </p>
              <p className="text-[12.5px] text-[var(--pl-text-muted)]">{timeAgo(s.lastSeenAt)}</p>
            </div>
          </div>
          <button onClick={() => revoke(s.id, s.current)} disabled={busy === s.id} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)] disabled:opacity-60">
            {busy === s.id ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />} {s.current ? 'Sign out' : 'Revoke'}
          </button>
        </div>
      ))}
    </div>
  );
}

/* ── Billing ──────────────────────────────────────────────────────────────── */
interface BillingApi {
  state: { planKey: string; status: string; trialDaysLeft: number; cancelAtPeriodEnd: boolean; hasSubscription: boolean };
  canManage: boolean;
  stripeReady: boolean;
  plans: { key: string; name: string; blurb: string; price: string; features: string[] }[];
  workspace: string;
}

export function BillingView() {
  const [data, setData] = useState<BillingApi | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch('/api/billing/state', { cache: 'no-store' })
      .then(async (r) => { if (r.status === 403) { setForbidden(true); return null; } return r.ok ? r.json() : null; })
      .then((d) => d && setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function checkout(plan: string) {
    setBusy(plan); setErr('');
    try {
      const r = await fetch('/api/billing/create-checkout-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) });
      const d = await r.json();
      if (r.ok && d.url) { window.location.href = d.url; return; }
      setErr(d.error || 'Could not start checkout.');
    } catch { setErr('Could not start checkout.'); } finally { setBusy(null); }
  }
  async function portal() {
    setBusy('portal'); setErr('');
    try {
      const r = await fetch('/api/billing/create-portal-session', { method: 'POST' });
      const d = await r.json();
      if (r.ok && d.url) { window.location.href = d.url; return; }
      setErr(d.error || 'Could not open the billing portal.');
    } catch { setErr('Could not open the billing portal.'); } finally { setBusy(null); }
  }

  return (
    <PageContainer narrow>
      <PageHeader eyebrow="Account" title="Billing & plan" description="Your current plan, trial and invoices." />

      {forbidden ? (
        <SettingsCard icon={CreditCard} title="Billing">
          <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4 text-[13.5px] text-[var(--pl-text-muted)]">
            You don&apos;t have permission to view billing. Ask a workspace admin for access.
          </div>
        </SettingsCard>
      ) : (
        <>
          <SettingsCard icon={CreditCard} title="Current plan"
            action={data && <span className="rounded-full border border-[color-mix(in_srgb,var(--pl-green)_30%,var(--pl-border))] bg-[var(--pl-green-soft)] px-2.5 py-1 text-[11.5px] font-bold uppercase text-[var(--pl-green-dark)]">{data.state.status}</span>}
          >
            <div className="flex flex-col gap-3 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-display text-[15px] font-bold capitalize">{loading ? 'Loading…' : `${data?.state.planKey ?? 'free'} plan`}</p>
                <p className="mt-0.5 text-[13px] text-[var(--pl-text-muted)]">
                  {data?.state.hasSubscription
                    ? (data.state.cancelAtPeriodEnd ? 'Cancels at period end.' : 'Active subscription.')
                    : `${data?.state.trialDaysLeft ?? 0} trial days left · all agents free during early access.`}
                </p>
              </div>
              {data?.canManage && data.state.hasSubscription && (
                <button onClick={portal} disabled={busy === 'portal'} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-2.5 text-[13.5px] font-semibold text-[var(--pl-text)] transition hover:border-[var(--pl-border-strong)] disabled:opacity-60">
                  {busy === 'portal' ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />} Manage billing
                </button>
              )}
            </div>
            {data && !data.stripeReady && <p className="mt-3 text-[12.5px] text-[var(--pl-text-muted)]">Billing isn&apos;t fully configured on the server yet (Stripe keys/prices). Checkout will activate once it is.</p>}
            {!data?.canManage && !loading && <p className="mt-3 text-[12.5px] text-[var(--pl-text-muted)]">You can view billing but not manage it. Ask a workspace admin to change plans.</p>}
            {err && <p className="mt-3 text-[13px] font-semibold text-[#ef4444]">{err}</p>}
          </SettingsCard>

          {data?.canManage && !data.state.hasSubscription && (
            <SettingsCard icon={CreditCard} title="Upgrade" subtitle="Pick a plan to unlock more.">
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                {data.plans.map((p) => (
                  <div key={p.key} className="flex flex-col rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4">
                    <p className="font-display text-[15px] font-extrabold">{p.name}</p>
                    <p className="text-[13px] font-bold text-[var(--pl-green-dark)]">{p.price}</p>
                    <p className="mt-1 text-[12.5px] text-[var(--pl-text-muted)]">{p.blurb}</p>
                    <ul className="mt-2 flex-1 space-y-1">
                      {p.features.map((f) => <li key={f} className="flex items-center gap-1.5 text-[12px] text-[var(--pl-text-soft)]"><Check size={12} className="text-[var(--pl-green)]" /> {f}</li>)}
                    </ul>
                    <button onClick={() => checkout(p.key)} disabled={!data.stripeReady || busy === p.key} className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#22C55E] to-[#0EA5A3] px-3 py-2 text-[13px] font-bold text-white transition hover:brightness-110 disabled:opacity-50" title={!data.stripeReady ? 'Billing not configured yet' : undefined}>
                      {busy === p.key ? <Loader2 size={14} className="animate-spin" /> : null} Choose {p.name}
                    </button>
                  </div>
                ))}
              </div>
            </SettingsCard>
          )}

          <SettingsCard icon={FileWarning} title="Billing history" subtitle="Invoices and receipts.">
            <div className="rounded-2xl border border-dashed border-[var(--pl-border-strong)] bg-[var(--pl-surface-soft)] p-6 text-center text-[13.5px] text-[var(--pl-text-muted)]">
              {data?.state.hasSubscription ? 'Open “Manage billing” to view invoices and receipts.' : 'No invoices yet.'}
            </div>
          </SettingsCard>
        </>
      )}
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
      <SettingsCard icon={Users} title="Team members" subtitle="People with access to this workspace and their roles.">
        <MembersManager />
      </SettingsCard>
    </PageContainer>
  );
}

interface Member { id: string; role: string; status: string; email: string | null; name: string | null; isSelf: boolean }
interface Invite { id: string; email: string; role: string; expiresAt: string }
interface MembersApi { me: { role: string; canInvite: boolean; canRemove: boolean; canUpdateRole: boolean }; members: Member[]; invitations: Invite[]; roles: string[] }

function MembersManager() {
  const [data, setData] = useState<MembersApi | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null);

  async function load() {
    try {
      const r = await fetch('/api/workspace/members', { cache: 'no-store' });
      if (r.status === 403) { setForbidden(true); return; }
      if (r.ok) { const d = await r.json(); setData(d); if (d.roles?.[0]) setRole((prev) => prev || d.roles[0]); }
    } catch { /* */ } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setNote(null);
    try {
      const r = await fetch('/api/workspace/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, role }) });
      const d = await r.json();
      if (!r.ok) { setNote({ ok: false, msg: d.error || 'Could not send invite.' }); return; }
      setNote({ ok: true, msg: d.emailed ? 'Invitation sent.' : 'Invitation created (email not configured).' });
      setEmail('');
      await load();
    } catch { setNote({ ok: false, msg: 'Could not send invite.' }); } finally { setBusy(false); }
  }

  async function updateRole(memberId: string, newRole: string) {
    setNote(null);
    try {
      const r = await fetch('/api/workspace/members', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId, role: newRole }) });
      if (!r.ok) { const d = await r.json(); setNote({ ok: false, msg: d.error || 'Could not update role.' }); }
      await load();
    } catch { setNote({ ok: false, msg: 'Could not update role.' }); }
  }

  async function remove(kind: 'member' | 'invite', id: string) {
    setNote(null);
    try {
      const r = await fetch('/api/workspace/members', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, id }) });
      if (!r.ok) { const d = await r.json(); setNote({ ok: false, msg: d.error || 'Could not remove.' }); }
      await load();
    } catch { setNote({ ok: false, msg: 'Could not remove.' }); }
  }

  if (loading) return <div className="flex items-center gap-2 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4 text-[13.5px] text-[var(--pl-text-muted)]"><Loader2 size={15} className="animate-spin" /> Loading team…</div>;
  if (forbidden || !data) return <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4 text-[13.5px] text-[var(--pl-text-muted)]">You don&apos;t have permission to view team members. Ask a workspace admin.</div>;

  const canOwnerEdit = data.me.canUpdateRole;
  return (
    <div className="space-y-4">
      {data.me.canInvite && (
        <form onSubmit={invite} className="flex flex-col gap-2 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3 sm:flex-row">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" className="flex-1 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3.5 py-2.5 text-[14px] text-[var(--pl-text)] outline-none focus:border-[var(--pl-green)]" />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3 py-2.5 text-[14px] capitalize text-[var(--pl-text)] outline-none">
            {data.roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#22C55E] to-[#0EA5A3] px-4 py-2.5 text-[13.5px] font-bold text-white transition hover:brightness-110 disabled:opacity-60">{busy ? <Loader2 size={14} className="animate-spin" /> : null} Invite</button>
        </form>
      )}
      {note && <p className={`text-[13px] font-semibold ${note.ok ? 'text-[var(--pl-green-dark)]' : 'text-[#ef4444]'}`}>{note.msg}</p>}

      <div className="divide-y divide-[var(--pl-border)] rounded-2xl border border-[var(--pl-border)]">
        {data.members.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-[var(--pl-text)]">{m.name || m.email || 'Member'} {m.isSelf && <span className="text-[11px] font-normal text-[var(--pl-text-muted)]">(you)</span>}</p>
              <p className="truncate text-[12.5px] text-[var(--pl-text-muted)]">{m.email}</p>
            </div>
            <div className="flex flex-none items-center gap-2">
              {canOwnerEdit && m.role !== 'owner' && !m.isSelf ? (
                <select value={m.role} onChange={(e) => updateRole(m.id, e.target.value)} className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] px-2 py-1 text-[12.5px] capitalize text-[var(--pl-text)]">
                  {data.roles.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              ) : (
                <span className="rounded-full border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-2.5 py-1 text-[11.5px] font-bold capitalize text-[var(--pl-text-muted)]">{m.role}</span>
              )}
              {data.me.canRemove && m.role !== 'owner' && !m.isSelf && (
                <button onClick={() => remove('member', m.id)} className="rounded-lg border border-[var(--pl-border)] px-2 py-1 text-[12px] font-semibold text-[#ef4444] transition hover:bg-[color-mix(in_srgb,#ef4444_10%,transparent)]">Remove</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {data.invitations.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--pl-text-muted)]">Pending invitations</p>
          <div className="divide-y divide-[var(--pl-border)] rounded-2xl border border-[var(--pl-border)]">
            {data.invitations.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-[var(--pl-text)]">{i.email}</p>
                  <p className="text-[12.5px] capitalize text-[var(--pl-text-muted)]">{i.role} · invited</p>
                </div>
                {data.me.canInvite && <button onClick={() => remove('invite', i.id)} className="flex-none rounded-lg border border-[var(--pl-border)] px-2 py-1 text-[12px] font-semibold text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)]">Cancel</button>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Notifications ────────────────────────────────────────────────────────── */
const PREFS: { key: string; label: string; desc: string; locked?: boolean }[] = [
  { key: 'emailLeads', label: 'New leads & messages', desc: 'When a customer reaches out or a lead comes in.' },
  { key: 'emailApprovals', label: 'Approvals waiting', desc: 'When Pixie needs your sign-off on something.' },
  { key: 'emailBilling', label: 'Billing alerts', desc: 'Payment receipts, failures and plan changes.' },
  { key: 'weeklySummary', label: 'Weekly summary', desc: 'A digest of what Pixie did for your business.' },
  { key: 'productUpdates', label: 'Product updates', desc: 'New agents and features as they launch.' },
  { key: 'emailSecurity', label: 'Security alerts', desc: 'Sign-ins, password and 2FA changes. Always on.', locked: true },
];

export function NotificationsView() {
  const [on, setOn] = useState<Record<string, boolean>>({ emailLeads: true, emailApprovals: true, emailBilling: true, weeklySummary: true, productUpdates: false, emailSecurity: true });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/notifications', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.prefs) setOn((s) => ({ ...s, ...pick(d.prefs) })); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  async function toggle(key: string, locked?: boolean) {
    if (locked || busy) return;
    const next = { ...on, [key]: !on[key] };
    setOn(next);
    setBusy(true);
    setToast(null);
    try {
      const r = await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      if (!r.ok) throw new Error();
      setToast({ ok: true, msg: 'Saved.' });
    } catch {
      setOn(on); // revert
      setToast({ ok: false, msg: 'Could not save. Try again.' });
    } finally { setBusy(false); }
  }

  return (
    <PageContainer narrow>
      <PageHeader eyebrow="Account" title="Notifications" description="Choose what Pixie emails you about." />
      <SettingsCard icon={Bell} title="Email preferences"
        action={toast && <span className={`text-[12.5px] font-semibold ${toast.ok ? 'text-[var(--pl-green-dark)]' : 'text-[#ef4444]'}`}>{toast.msg}</span>}
      >
        <div className={`divide-y divide-[var(--pl-border)] ${loading ? 'opacity-60' : ''}`}>
          {PREFS.map((p) => (
            <div key={p.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div>
                <p className="text-[14px] font-semibold text-[var(--pl-text)]">{p.label}</p>
                <p className="text-[12.5px] text-[var(--pl-text-muted)]">{p.desc}</p>
              </div>
              <button type="button" role="switch" aria-checked={on[p.key]} disabled={p.locked || loading || busy} onClick={() => toggle(p.key, p.locked)}
                className="relative h-6 w-11 flex-none rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-70" style={{ background: on[p.key] ? 'var(--pl-green)' : 'var(--pl-border-strong)' }}>
                <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left]" style={{ left: on[p.key] ? '22px' : '2px' }} />
              </button>
            </div>
          ))}
        </div>
      </SettingsCard>
    </PageContainer>
  );
}

function pick(prefs: Record<string, unknown>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const k of ['emailLeads', 'emailApprovals', 'emailBilling', 'weeklySummary', 'productUpdates', 'emailSecurity']) {
    if (typeof prefs[k] === 'boolean') out[k] = prefs[k] as boolean;
  }
  return out;
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
