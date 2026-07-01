'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Mail, Lock, User as UserIcon, Building2, Link2, AlertCircle, type LucideIcon } from 'lucide-react';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';
import { getAgentBySlug } from '@/lib/agents';

const SAFE = (n: string | null, fb: string) => (n && n.startsWith('/') && !n.startsWith('//') ? n : fb);

/**
 * SignupForm — agent-aware Pixie signup on Supabase. Reads ?agent & ?redirect,
 * stores the intended agent + business details in user_metadata, and triggers
 * Supabase's email verification (emailRedirectTo → /auth/callback?next=redirect).
 * No payment. After submit → /verify-email (or straight to redirect if the
 * project has email-confirmation disabled).
 */
export function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const agent = getAgentBySlug(params.get('agent'));
  const agentLabel = agent?.name ?? 'Pixie';
  const redirect = SAFE(params.get('redirect'), agent?.dashboardPath ?? '/pixie-lab/dashboard');

  const [f, setF] = useState({ name: '', email: '', password: '', business_name: '', website_or_social: '', short_note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!supabaseConfigured()) {
      setError('Authentication isn’t configured yet. Add your Supabase keys to enable signup.');
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email: f.email,
        password: f.password,
        options: {
          data: {
            full_name: f.name,
            business_name: f.business_name,
            website_or_social: f.website_or_social,
            short_note: f.short_note,
            intended_agent: agent?.slug ?? '',
            intended_redirect: redirect,
            onboarded: false,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirect)}`,
        },
      });
      if (error) throw error;
      // Email-confirmation ON (default) → no session yet → go wait for the email.
      if (!data.session) {
        router.push(`/verify-email?email=${encodeURIComponent(f.email)}${agent ? `&agent=${encodeURIComponent(agent.slug)}` : ''}`);
      } else {
        router.replace(redirect);
        router.refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(/already registered|exists/i.test(msg) ? 'That email already has an account — try signing in instead.' : msg);
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    'w-full rounded-xl border border-white/12 bg-white/[0.04] py-2.5 pl-10 pr-3 text-[15px] text-white placeholder-white/30 outline-none focus:border-[#25D366]/45';
  const btnLabel = agent ? `Create Account & Start ${agentLabel}` : 'Create My Pixie Account';

  return (
    <form onSubmit={onSubmit} className="space-y-3.5">
      {agent && (
        <div className="rounded-xl border border-[#25D366]/20 bg-[#25D366]/[0.07] px-4 py-3 text-[13px] text-[#bff3d0]">
          Start your Pixie setup — create your account to continue with <b className="font-semibold text-white">{agentLabel}</b>.
          <span className="text-[#7ef0a8]"> No payment required right now.</span>
        </div>
      )}

      <Field icon={UserIcon}><input className={inputCls} placeholder="Your name" value={f.name} onChange={set('name')} required /></Field>
      <Field icon={Mail}><input className={inputCls} type="email" placeholder="you@business.com" value={f.email} onChange={set('email')} required /></Field>
      <Field icon={Lock}><input className={inputCls} type="password" placeholder="Create a password" value={f.password} onChange={set('password')} required minLength={6} /></Field>
      <Field icon={Building2}><input className={inputCls} placeholder="Business name (optional)" value={f.business_name} onChange={set('business_name')} /></Field>
      <Field icon={Link2}><input className={inputCls} placeholder="Website or social link (optional)" value={f.website_or_social} onChange={set('website_or_social')} /></Field>

      {error && (
        <p className="flex items-center gap-1.5 text-[13px] text-rose-300"><AlertCircle size={14} /> {error}</p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#25D366] to-[#22d3ee] py-3 text-[15px] font-bold text-[#02070a] transition-transform active:scale-[0.99] disabled:opacity-70"
      >
        {busy ? <Loader2 size={17} className="animate-spin" /> : btnLabel}
      </button>
      <p className="text-center text-[12px] text-white/40">No payment required — this only starts your setup.</p>
    </form>
  );
}

function Field({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="relative">
      <Icon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
      {children}
    </div>
  );
}
