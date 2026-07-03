'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';

/**
 * OtpVerify — 6-digit email OTP verification for signup (native Supabase
 * verifyOtp, type='signup'). Auto-advancing boxes, paste support, resend with
 * cooldown, loading/error/success states. On success a Supabase session is set
 * and we route into Pixie Lab. No codes are ever logged.
 */
const RESEND_COOLDOWN = 45; // seconds
const LEN = 6;

export function OtpVerify({ email, next, agent }: { email: string; next: string; agent?: string }) {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(Array(LEN).fill(''));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'idle' | 'error' | 'success'>('idle');
  const [msg, setMsg] = useState('');
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [resending, setResending] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const code = useMemo(() => digits.join(''), [digits]);

  useEffect(() => { inputs.current[0]?.focus(); }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  function setAt(i: number, v: string) {
    setStatus('idle');
    setMsg('');
    setDigits((d) => { const n = [...d]; n[i] = v; return n; });
  }

  function onChange(i: number, raw: string) {
    const v = raw.replace(/\D/g, '');
    if (!v) { setAt(i, ''); return; }
    if (v.length === 1) {
      setAt(i, v);
      if (i < LEN - 1) inputs.current[i + 1]?.focus();
    } else {
      // pasted multiple digits
      const chars = v.slice(0, LEN).split('');
      const next = Array(LEN).fill('').map((_, k) => chars[k] ?? '');
      setDigits(next);
      const last = Math.min(chars.length, LEN) - 1;
      inputs.current[last]?.focus();
    }
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft' && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < LEN - 1) inputs.current[i + 1]?.focus();
  }

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    if (code.length !== LEN) { setStatus('error'); setMsg('Enter the 6-digit code from your email.'); return; }
    if (!supabaseConfigured()) { setStatus('error'); setMsg('Verification isn’t configured in this environment.'); return; }
    setBusy(true);
    setStatus('idle');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'signup' });
      if (error) {
        setStatus('error');
        // Safe, non-enumerating message.
        setMsg(/expired/i.test(error.message) ? 'That code has expired. Request a new one.' : 'That code is incorrect or expired. Try again.');
        setDigits(Array(LEN).fill(''));
        inputs.current[0]?.focus();
        return;
      }
      setStatus('success');
      setMsg('Verified! Taking you to Pixie Lab…');
      router.replace(next || '/pixie-lab/dashboard');
      router.refresh();
    } catch {
      setStatus('error');
      setMsg('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setStatus('idle');
    setMsg('');
    try {
      if (supabaseConfigured()) {
        await createClient().auth.resend({ type: 'signup', email });
      }
      setCooldown(RESEND_COOLDOWN);
      setMsg('A new code is on its way if this email can receive one.');
    } catch {
      // Never surface enumeration; generic + reset cooldown anyway.
      setCooldown(RESEND_COOLDOWN);
      setMsg('A new code is on its way if this email can receive one.');
    } finally {
      setResending(false);
    }
  }

  // auto-submit when all 6 filled
  useEffect(() => {
    if (code.length === LEN && !busy && status !== 'success') verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <form onSubmit={verify} className="space-y-5">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[13px] text-white/70">
        We sent a 6-digit code to <b className="font-semibold text-white">{email || 'your email'}</b>. Enter it below to verify your account.
      </div>

      <div className="flex justify-between gap-2 sm:gap-3" role="group" aria-label="One-time code">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { inputs.current[i] = el; }}
            value={d}
            onChange={(e) => onChange(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={LEN}
            aria-label={`Digit ${i + 1}`}
            className={`h-12 w-full rounded-xl border bg-white/[0.04] text-center text-xl font-bold text-white outline-none transition sm:h-14 ${
              status === 'error' ? 'border-rose-400/60' : status === 'success' ? 'border-[#25D366]/60' : 'border-white/12 focus:border-[#25D366]/60'
            }`}
          />
        ))}
      </div>

      {msg && (
        <p className={`flex items-center gap-1.5 text-[13px] ${status === 'error' ? 'text-rose-300' : status === 'success' ? 'text-[#7ef0a8]' : 'text-white/55'}`}>
          {status === 'error' ? <AlertCircle size={14} /> : status === 'success' ? <ShieldCheck size={14} /> : null} {msg}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || status === 'success'}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#25D366] to-[#22d3ee] py-3 text-[15px] font-bold text-[#02070a] transition-transform active:scale-[0.99] disabled:opacity-70"
      >
        {busy ? <Loader2 size={17} className="animate-spin" /> : status === 'success' ? <ShieldCheck size={17} /> : 'Verify & continue'}
      </button>

      <div className="flex items-center justify-center gap-1.5 text-[13px] text-white/50">
        Didn’t get it?
        <button
          type="button"
          onClick={resend}
          disabled={cooldown > 0 || resending}
          className="inline-flex items-center gap-1.5 font-semibold text-[#7ef0a8] transition disabled:text-white/35"
        >
          {resending ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </button>
      </div>

      <p className="text-center text-[12px] text-white/35">
        Wrong email?{' '}
        <a href={`/signup${agent ? `?agent=${encodeURIComponent(agent)}` : ''}`} className="font-semibold text-white/60 hover:text-white">Start over</a>
      </p>
    </form>
  );
}
