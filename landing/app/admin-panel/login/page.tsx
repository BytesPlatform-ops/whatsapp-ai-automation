'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Lock, LogIn } from 'lucide-react';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');

  const configured = supabaseConfigured();

  // Already signed in? Skip the form and go straight to the panel.
  useEffect(() => {
    if (!configured) return;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (data.user) {
          router.replace('/admin-panel');
          router.refresh();
        }
      });
  }, [configured, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === 'loading') return;
    if (!configured) {
      setError('Supabase isn’t configured on this deployment yet.');
      setStatus('error');
      return;
    }
    setStatus('loading');
    setError('');

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (signInError) {
      setError(signInError.message || 'Invalid email or password.');
      setStatus('error');
      return;
    }

    // Cookie is set by the SSR client; let the server re-read it.
    router.replace('/admin-panel');
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(99,102,241,0.18),transparent_70%)]"
      />
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900/70 p-8 shadow-2xl backdrop-blur"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/30">
            <Lock className="h-6 w-6" strokeWidth={2.2} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Pixie Admin</h1>
          <p className="mt-1 text-sm text-slate-400">Sign in to view waitlist responses.</p>
        </div>

        <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === 'error') setStatus('idle');
          }}
          placeholder="you@bytesplatform.com"
          className="mb-4 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none transition focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20"
        />

        <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (status === 'error') setStatus('idle');
          }}
          placeholder="••••••••"
          className="mb-5 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none transition focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20"
        />

        {status === 'error' && (
          <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={status === 'loading'}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-60"
        >
          {status === 'loading' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <LogIn className="h-4 w-4" strokeWidth={2.4} />
              Sign in
            </>
          )}
        </button>
      </form>
    </main>
  );
}
