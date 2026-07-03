'use client';

import { useState } from 'react';
import { Loader2, Mail, AlertCircle, CheckCircle2 } from 'lucide-react';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';

/**
 * ForgotPasswordForm — sends a Supabase password-reset email. The link returns
 * to /auth/callback?next=/reset-password, which exchanges the code for a
 * recovery session so the user can set a new password. Non-enumerating: the
 * success message is identical whether or not the email exists.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!supabaseConfigured()) { setError('Authentication isn’t configured yet.'); return; }
    setBusy(true);
    try {
      await createClient().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      // Always show success (no account enumeration).
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-[#25D366]/25 bg-[#25D366]/[0.07] px-4 py-4">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} className="flex-none text-[#7ef0a8]" />
            <p className="text-[15px] font-semibold text-white">Check your inbox</p>
          </div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-[#bff3d0]">
            If an account exists for this email, we’ve sent a link to reset your password.
          </p>
          <p className="mt-2 break-all rounded-lg bg-black/20 px-3 py-2 text-[13px] font-medium text-white/90">
            {email}
          </p>
          <p className="mt-2 text-[12.5px] text-[#bff3d0]/70">The link expires in an hour.</p>
        </div>
        <a href="/login" className="inline-flex w-full items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] py-3 text-[15px] font-semibold text-white/85 transition hover:bg-white/[0.07]">Back to sign in</a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3.5">
      <div className="relative">
        <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
        <input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email"
          className="w-full rounded-xl border border-white/12 bg-white/[0.04] py-3 pl-10 pr-3 text-[15px] text-white placeholder-white/30 outline-none focus:border-[#25D366]/60"
        />
      </div>
      {error && <p className="flex items-center gap-1.5 text-[13px] text-rose-300"><AlertCircle size={14} /> {error}</p>}
      <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#25D366] to-[#22d3ee] py-3 text-[15px] font-bold text-[#02070a] transition-transform active:scale-[0.99] disabled:opacity-70">
        {busy ? <Loader2 size={17} className="animate-spin" /> : 'Send reset link'}
      </button>
      <p className="text-center text-[12px] text-white/40">Remembered it? <a href="/login" className="font-semibold text-white/60 hover:text-white">Sign in</a></p>
    </form>
  );
}
