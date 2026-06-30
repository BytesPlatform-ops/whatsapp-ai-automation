'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { MailCheck, Loader2, RefreshCw } from 'lucide-react';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';
import { getAgentBySlug } from '@/lib/agents';

/**
 * VerifyEmailCard — the calm "check your inbox" screen after signup. Supabase
 * already sent the confirmation link (clicking it hits /auth/callback and signs
 * the user in). This screen lets them resend and explains what happens next,
 * preserving the agent they came in for.
 */
export function VerifyEmailCard() {
  const params = useSearchParams();
  const email = params.get('email') || '';
  const agent = getAgentBySlug(params.get('agent'));
  const agentLabel = agent?.name ?? 'Pixie';

  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function resend() {
    setError('');
    if (!supabaseConfigured() || !email) {
      setError('Add your email on the signup page to resend.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await createClient().auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(agent?.dashboardPath ?? '/app/dashboard')}` },
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend right now.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative grid min-h-screen place-items-center bg-[#02070a] px-5 text-white">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[420px]" style={{ background: 'radial-gradient(80% 100% at 50% 0%, rgba(37,211,102,0.12), transparent 60%)' }} />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center backdrop-blur-xl"
      >
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#25D366]/25 to-[#22d3ee]/25 text-[#7ef0a8]">
          <MailCheck size={26} />
        </div>
        <h1 className="mt-5 font-display text-2xl font-extrabold tracking-tight">Verify your email to unlock your dashboard</h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-white/55">
          We sent a secure link{email ? <> to <span className="font-semibold text-white/80">{email}</span></> : ' to your inbox'}. Once verified,
          Pixie will prepare your workspace{agent ? <> and continue your <span className="font-semibold text-white/80">{agentLabel}</span> setup</> : ''}.
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            onClick={resend}
            disabled={busy || sent}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] py-3 text-[14px] font-semibold text-white transition hover:bg-white/[0.08] disabled:opacity-60"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : sent ? 'Email sent ✓' : <><RefreshCw size={15} /> Resend email</>}
          </button>
          <Link href="/login" className="py-2 text-[13px] text-white/50 hover:text-white">Back to login</Link>
        </div>

        {error && <p className="mt-3 text-[13px] text-rose-300">{error}</p>}
        <p className="mt-5 text-[12px] text-white/35">Didn’t get it? Check spam, or resend above. The link signs you in automatically.</p>
      </motion.div>
    </div>
  );
}
