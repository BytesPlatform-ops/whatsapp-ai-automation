'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LayoutDashboard } from 'lucide-react';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';

/**
 * Auth-aware nav entry points. Logged out → "Log in" + "Sign up". Logged in →
 * "Dashboard". Reacts to auth state changes live. Defaults to the logged-out
 * view while resolving (no flash for the common case).
 *
 * `themed` makes the primary button use the active role's CSS var (--accent),
 * matching the homepage hero; otherwise it uses the brand green.
 */
export function NavAuth({
  variant = 'desktop',
  themed = false,
}: {
  variant?: 'desktop' | 'mobile';
  themed?: boolean;
}) {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured()) return;
    const supabase = createClient();
    let alive = true;
    supabase.auth.getUser().then(({ data }) => alive && setAuthed(Boolean(data.user)));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setAuthed(Boolean(session?.user)),
    );
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const primaryStyle = themed
    ? { background: 'var(--accent)', color: 'var(--button-text)' }
    : undefined;
  const primaryCls = themed ? '' : 'bg-[#25D366] text-navy-900';

  if (variant === 'mobile') {
    return authed ? (
      <Link
        href="/dashboard"
        className={`flex items-center justify-center gap-2 rounded-full py-3.5 text-base font-bold ${primaryCls}`}
        style={primaryStyle}
      >
        <LayoutDashboard size={18} /> Go to dashboard
      </Link>
    ) : (
      <div className="flex gap-2.5">
        <Link
          href="/login"
          className="flex-1 rounded-full border border-white/20 py-3.5 text-center text-base font-semibold text-white/90"
        >
          Log in
        </Link>
        <Link
          href="/register"
          className={`flex-1 rounded-full py-3.5 text-center text-base font-bold ${primaryCls}`}
          style={primaryStyle}
        >
          Sign up
        </Link>
      </div>
    );
  }

  return authed ? (
    <Link
      href="/dashboard"
      className={`inline-flex h-11 items-center gap-1.5 rounded-full px-5 text-sm font-semibold transition-transform hover:-translate-y-0.5 ${primaryCls}`}
      style={primaryStyle}
    >
      <LayoutDashboard size={15} /> Dashboard
    </Link>
  ) : (
    <>
      <Link href="/login" className="px-1 text-sm font-semibold text-white/75 transition hover:text-white">
        Log in
      </Link>
      <Link
        href="/register"
        className={`inline-flex h-11 items-center rounded-full px-5 text-sm font-semibold transition-transform hover:-translate-y-0.5 ${primaryCls}`}
        style={primaryStyle}
      >
        Sign up
      </Link>
    </>
  );
}
