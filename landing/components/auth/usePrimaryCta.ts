'use client';

import { useEffect, useState } from 'react';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';

export type PrimaryCta = { label: string; href: string; authed: boolean };

/**
 * Single source of truth for the landing page's primary Pixie CTA.
 *   signed in  → "Enter Pixie Lab" → /pixie-lab/for-you
 *   signed out → "Join Pixie"      → /join-pixie
 * Reacts to auth state live and defaults to the signed-out CTA while resolving
 * (no flash for the common visitor). Use this everywhere on the landing page so
 * the label + route never diverge or duplicate.
 */
export function usePrimaryCta(): PrimaryCta {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured()) return;
    const supabase = createClient();
    let alive = true;
    supabase.auth.getUser().then(({ data }) => alive && setAuthed(Boolean(data.user)));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setAuthed(Boolean(session?.user)));
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return authed
    ? { label: 'Enter Pixie Lab', href: '/pixie-lab/for-you', authed }
    : { label: 'Join Pixie', href: '/join-pixie', authed };
}
