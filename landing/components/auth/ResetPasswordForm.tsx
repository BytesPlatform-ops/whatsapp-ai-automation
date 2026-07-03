'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';

/**
 * ResetPasswordForm — sets a new password using the recovery session that
 * /auth/callback established from the reset link. If there's no session (link
 * expired or opened directly), it prompts the user to request a fresh link.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState<'checking' | 'ok' | 'invalid'>('checking');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured()) { setReady('invalid'); return; }
    createClient().auth.getSession().then(({ data }) => setReady(data.session ? 'ok' : 'invalid')).catch(() => setReady('invalid'));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (pw.length < 8) return setError('Use at least 8 characters.');
    if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return setError('Use at least one letter and one number.');
    if (pw !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      const { error } = await createClient().auth.updateUser({ password: pw });
      if (error) throw error;
      setDone(true);
      setTimeout(() => { router.replace('/pixie-lab/dashboard'); router.refresh(); }, 900);
    } catch (err: any) {
      setError(err?.message || 'Could not update your password. Request a new link and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (ready === 'checking') {
    return <div className="flex items-center gap-2 text-[14px] text-white/70"><Loader2 size={16} className="animate-spin" /> Verifying your reset link…</div>;
  }
  if (ready === 'invalid') {
    return (
      <div className="space-y-4">
        <p className="flex items-center gap-1.5 text-[14px] text-rose-300"><AlertCircle size={16} /> This reset link is invalid or has expired.</p>
        <a href="/forgot-password" className="inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#25D366] to-[#22d3ee] py-3 text-[15px] font-bold text-[#02070a]">Request a new link</a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3.5">
      <div className="relative">
        <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
        <input type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" autoComplete="new-password" minLength={8} required
          className="w-full rounded-xl border border-white/12 bg-white/[0.04] py-3 pl-10 pr-11 text-[15px] text-white placeholder-white/30 outline-none focus:border-[#25D366]/60" />
        <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70" aria-label={show ? 'Hide' : 'Show'}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
      </div>
      <div className="relative">
        <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
        <input type={show ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" autoComplete="new-password" minLength={8} required
          className="w-full rounded-xl border border-white/12 bg-white/[0.04] py-3 pl-10 pr-3 text-[15px] text-white placeholder-white/30 outline-none focus:border-[#25D366]/60" />
      </div>
      {error && <p className="flex items-center gap-1.5 text-[13px] text-rose-300"><AlertCircle size={14} /> {error}</p>}
      {done && <p className="flex items-center gap-1.5 text-[13px] text-[#7ef0a8]"><CheckCircle2 size={14} /> Password updated — taking you in…</p>}
      <button type="submit" disabled={busy || done} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#25D366] to-[#22d3ee] py-3 text-[15px] font-bold text-[#02070a] transition-transform active:scale-[0.99] disabled:opacity-70">
        {busy ? <Loader2 size={17} className="animate-spin" /> : done ? <ShieldCheck size={17} /> : 'Update password'}
      </button>
    </form>
  );
}
