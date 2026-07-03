'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck, AlertCircle } from 'lucide-react';

/**
 * AcceptInvite — calls /api/invite/accept. If nobody is signed in, sends the
 * invitee through OTP signup/login (prefilled email) and back to this page to
 * finish. On success, into Pixie Lab.
 */
export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<'working' | 'needsAuth' | 'error' | 'done'>('working');
  const [msg, setMsg] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (!token) { setState('error'); setMsg('This invitation link is invalid.'); return; }
    (async () => {
      try {
        const r = await fetch('/api/invite/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
        const d = await r.json();
        if (d.needsAuth) { setEmail(d.email ?? ''); setState('needsAuth'); return; }
        if (!r.ok || !d.ok) { setState('error'); setMsg(d.error || 'This invitation could not be accepted.'); return; }
        setState('done');
        router.replace('/pixie-lab/dashboard');
        router.refresh();
      } catch {
        setState('error'); setMsg('Something went wrong. Please try again.');
      }
    })();
  }, [token, router]);

  const back = `/invite/accept?token=${encodeURIComponent(token)}`;

  if (state === 'working' || state === 'done') {
    return <div className="flex items-center gap-2 text-[14px] text-white/70"><Loader2 size={16} className="animate-spin" /> Accepting your invitation…</div>;
  }
  if (state === 'needsAuth') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-[#22d3ee]/25 bg-[#22d3ee]/[0.07] px-4 py-3 text-[13px] text-[#bfeefb]">
          Sign in or create your account{email ? <> for <b className="font-semibold text-white">{email}</b></> : ''} to join the workspace. You&apos;ll come right back here.
        </div>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <a href={`/signup?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(back)}`} className="flex-1 rounded-xl bg-gradient-to-r from-[#25D366] to-[#22d3ee] py-3 text-center text-[15px] font-bold text-[#02070a]">Create account</a>
          <a href={`/login?next=${encodeURIComponent(back)}`} className="flex-1 rounded-xl border border-white/12 bg-white/[0.04] py-3 text-center text-[15px] font-semibold text-white/80">Sign in</a>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-1.5 text-[14px] text-rose-300"><AlertCircle size={16} /> {msg}</p>
      <a href="/login" className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-[14px] font-semibold text-white/80"><ShieldCheck size={15} /> Go to sign in</a>
    </div>
  );
}
