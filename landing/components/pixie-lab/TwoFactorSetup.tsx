'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Loader2, ShieldCheck, ShieldOff, Check, AlertCircle, QrCode } from 'lucide-react';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';

/**
 * TwoFactorSetup — real TOTP two-factor auth via native Supabase MFA
 * (auth.mfa.enroll / challenge / verify / unenroll). Shows enrolled state, a
 * QR + manual secret during setup, code verification, and a disable action.
 * Degrades gracefully with a clear message if the project has MFA disabled.
 */

interface Factor { id: string; friendly_name?: string; status: string }

export function TwoFactorSetup() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const verified = factors.find((f) => f.status === 'verified');

  async function refresh() {
    if (!supabaseConfigured()) { setLoading(false); return; }
    try {
      const { data } = await createClient().auth.mfa.listFactors();
      setFactors(((data?.totp ?? []) as Factor[]));
    } catch { /* ignore */ } finally { setLoading(false); }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  async function startEnroll() {
    setStatus(null);
    if (!supabaseConfigured()) { setStatus({ ok: false, msg: 'Sign-in isn’t configured in this environment.' }); return; }
    setBusy(true);
    try {
      const { data, error } = await createClient().auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${Date.now()}` });
      if (error || !data) throw error ?? new Error('enroll failed');
      setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (e: any) {
      setStatus({ ok: false, msg: e?.message?.includes('MFA') ? 'Two-factor isn’t enabled for this project yet.' : 'Could not start 2FA setup. Try again.' });
    } finally { setBusy(false); }
  }

  async function verify() {
    if (!enroll || code.length < 6) { setStatus({ ok: false, msg: 'Enter the 6-digit code from your authenticator app.' }); return; }
    setBusy(true); setStatus(null);
    try {
      const supabase = createClient();
      const ch = await supabase.auth.mfa.challenge({ factorId: enroll.factorId });
      if (ch.error || !ch.data) throw ch.error ?? new Error('challenge failed');
      const v = await supabase.auth.mfa.verify({ factorId: enroll.factorId, challengeId: ch.data.id, code });
      if (v.error) throw v.error;
      setStatus({ ok: true, msg: 'Two-factor authentication enabled.' });
      setEnroll(null); setCode('');
      await refresh();
    } catch {
      setStatus({ ok: false, msg: 'That code didn’t match. Please try again.' });
    } finally { setBusy(false); }
  }

  async function disable(factorId: string) {
    setBusy(true); setStatus(null);
    try {
      const { error } = await createClient().auth.mfa.unenroll({ factorId });
      if (error) throw error;
      setStatus({ ok: true, msg: 'Two-factor authentication disabled.' });
      await refresh();
    } catch {
      setStatus({ ok: false, msg: 'Could not disable 2FA. Try again.' });
    } finally { setBusy(false); }
  }

  if (loading) {
    return <div className="flex items-center gap-2 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4 text-[13.5px] text-[var(--pl-text-muted)]"><Loader2 size={15} className="animate-spin" /> Checking 2FA status…</div>;
  }

  return (
    <div>
      {verified ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--pl-green)_30%,var(--pl-border))] bg-[var(--pl-green-soft)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-[var(--pl-green-dark)]"><ShieldCheck size={16} /> Two-factor authentication is on.</p>
          <button onClick={() => disable(verified.id)} disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-2.5 text-[13px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)] disabled:opacity-60">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldOff size={14} />} Disable
          </button>
        </div>
      ) : enroll ? (
        <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4">
          <p className="text-[13.5px] text-[var(--pl-text-soft)]">Scan this QR with Google Authenticator, 1Password, or Authy — then enter the 6-digit code.</p>
          <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="rounded-xl border border-[var(--pl-border)] bg-white p-2">
              {/* Supabase returns an SVG data URI */}
              <Image src={enroll.qr} alt="2FA QR code" width={144} height={144} className="h-36 w-36" unoptimized />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">Or enter this secret</p>
              <code className="mt-1 block break-all rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] px-2.5 py-1.5 text-[12.5px] text-[var(--pl-text)]">{enroll.secret}</code>
              <input
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric" placeholder="6-digit code"
                className="mt-3 w-full rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3.5 py-2.5 text-[15px] tracking-widest text-[var(--pl-text)] outline-none focus:border-[var(--pl-green)]"
              />
              <div className="mt-3 flex gap-2">
                <button onClick={verify} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#22C55E] to-[#0EA5A3] px-4 py-2.5 text-[13.5px] font-bold text-white transition hover:brightness-110 disabled:opacity-60">
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Verify & enable
                </button>
                <button onClick={() => { setEnroll(null); setCode(''); setStatus(null); }} className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-2.5 text-[13.5px] font-semibold text-[var(--pl-text-muted)]">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13.5px] text-[var(--pl-text-soft)]">Add a second step at sign-in with an authenticator app.</p>
          <button onClick={startEnroll} disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#22C55E] to-[#0EA5A3] px-4 py-2.5 text-[13px] font-bold text-white transition hover:brightness-110 disabled:opacity-60">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <QrCode size={14} />} Enable 2FA
          </button>
        </div>
      )}

      {status && (
        <p className={`mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold ${status.ok ? 'text-[var(--pl-green-dark)]' : 'text-[#ef4444]'}`}>
          {status.ok ? <Check size={14} /> : <AlertCircle size={14} />} {status.msg}
        </p>
      )}
    </div>
  );
}
