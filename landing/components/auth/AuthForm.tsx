'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2, Mail, Lock, User as UserIcon, AlertCircle, CheckCircle2 } from 'lucide-react';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';

type Mode = 'login' | 'register';

const SAFE_NEXT = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/pixie-lab/dashboard');

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = SAFE_NEXT(params.get('next'));

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const configured = supabaseConfigured();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!configured) {
      setError('Authentication isn’t configured yet. Add your Supabase keys to the environment to enable sign-in.');
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (error) throw error;
        if (data.session) {
          router.replace(next);
          router.refresh();
        } else {
          setNotice('Almost there — check your inbox to confirm your email, then sign in.');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
      }
    } catch (err: any) {
      setError(await loginErrorMessage(err, mode, email));
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setError('');
    if (!configured) {
      setError('Authentication isn’t configured yet. Add your Supabase keys to the environment.');
      return;
    }
    setOauthBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (error) throw error;
      // browser redirects to Google…
    } catch (err: any) {
      setError(err?.message || 'Google sign-in is unavailable.');
      setOauthBusy(false);
    }
  }

  const inputCls =
    'peer w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-11 pr-4 text-[15px] text-white placeholder-white/30 outline-none transition focus:border-[#25D366]/70 focus:bg-white/[0.06] focus:ring-2 focus:ring-[#25D366]/25';

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }}>
      {!configured && (
        <Banner kind="info" text="Demo build — set NEXT_PUBLIC_SUPABASE_URL & _ANON_KEY to enable real sign-in." />
      )}
      {error && <Banner kind="error" text={error} />}
      {notice && <Banner kind="success" text={notice} />}

      {/* Google */}
      <button
        type="button"
        onClick={onGoogle}
        disabled={oauthBusy}
        className="mb-4 flex w-full items-center justify-center gap-2.5 rounded-xl border border-white/12 bg-white/[0.03] py-3 text-[15px] font-semibold text-white/90 transition hover:bg-white/[0.07] disabled:opacity-60"
      >
        {oauthBusy ? <Loader2 size={18} className="animate-spin" /> : <GoogleIcon />}
        Continue with Google
      </button>

      <div className="my-5 flex items-center gap-3 text-xs text-white/30">
        <span className="h-px flex-1 bg-white/10" /> or {mode === 'register' ? 'sign up' : 'sign in'} with email <span className="h-px flex-1 bg-white/10" />
      </div>

      <form onSubmit={onSubmit} className="space-y-3.5">
        {mode === 'register' && (
          <Field icon={<UserIcon size={17} />}>
            <input className={inputCls} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </Field>
        )}
        <Field icon={<Mail size={17} />}>
          <input className={inputCls} type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </Field>
        <Field icon={<Lock size={17} />}>
          <input
            className={inputCls + ' pr-11'}
            type={show ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            minLength={6}
            required
          />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 transition hover:text-white/70" aria-label={show ? 'Hide password' : 'Show password'}>
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </Field>

        <button
          type="submit"
          disabled={busy}
          className="group relative mt-2 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-[#25D366] to-[#1bbf78] py-3.5 text-[15px] font-bold text-[#05140c] shadow-[0_10px_30px_-10px_rgba(37,211,102,0.6)] transition hover:brightness-105 disabled:opacity-70"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : null}
          {mode === 'register' ? 'Create account' : 'Sign in'}
        </button>
      </form>

      {mode === 'login' && (
        <p className="mt-3 text-right text-xs text-white/40">
          <a href="/forgot-password" className="font-semibold text-white/60 transition hover:text-white">Forgot password?</a>
        </p>
      )}
    </motion.div>
  );
}

/**
 * Turns a Supabase auth error into a human message. Supabase returns the same
 * generic "Invalid login credentials" for both a wrong password and an email
 * that has no account, so on that specific error we ask the server whether the
 * account exists and tailor the message accordingly.
 */
async function loginErrorMessage(err: any, mode: Mode, email: string): Promise<string> {
  const raw = String(err?.message || '');
  if (mode === 'login' && /invalid login credentials/i.test(raw)) {
    try {
      const res = await fetch('/api/auth/login-precheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { exists?: boolean };
      if (data?.exists === false) {
        return 'No account exists for this email. Create one to get started.';
      }
      return 'Incorrect password. Please try again or reset your password.';
    } catch {
      return 'Incorrect email or password. Please try again.';
    }
  }
  return raw || 'Something went wrong. Please try again.';
}

function Field({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35">{icon}</span>
      {children}
    </div>
  );
}

function Banner({ kind, text }: { kind: 'error' | 'success' | 'info'; text: string }) {
  const map = {
    error: { cls: 'border-red-500/30 bg-red-500/10 text-red-200', Icon: AlertCircle },
    success: { cls: 'border-[#25D366]/30 bg-[#25D366]/10 text-[#9ff0c1]', Icon: CheckCircle2 },
    info: { cls: 'border-amber-400/25 bg-amber-400/10 text-amber-200', Icon: AlertCircle },
  }[kind];
  const Icon = map.Icon;
  return (
    <div className={`mb-4 flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] leading-snug ${map.cls}`}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
    </svg>
  );
}
