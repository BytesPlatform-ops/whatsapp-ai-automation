'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Loader2, PartyPopper, Sparkles } from 'lucide-react';
import { ConfettiBurst } from '@/components/thankYou/ConfettiBurst';
import { SEATS_START, SEATS_LEFT, SEAT_CAP, SEATS_FLOOR } from './joinPixieData';

interface WaitlistCardProps {
  /** How many of the 6 roles the visitor swiped "yes" on. */
  picked: number;
  name?: string;
  business?: string;
  contact?: string;
  /** Service labels the visitor swiped right (interested) / left (passed). */
  selected?: string[];
  rejected?: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Live seats left = cap − real signups, never below the floor. */
function seatsLeftFromCount(count: number): number {
  return Math.max(SEATS_FLOOR, SEAT_CAP - count);
}

/**
 * Terminal card of the swipe deck: counts the remaining seats down from
 * SEATS_START → the live remaining count (cap − real signups, fetched from
 * `GET /api/waitlist`), then captures an email for the waitlist.
 * Styled via joinPixie.css.
 */
export function WaitlistCard({ picked, name, business, contact, selected, rejected }: WaitlistCardProps) {
  const [seats, setSeats] = useState(SEATS_START);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const [claimed, setClaimed] = useState(false);
  const claimedRef = useRef(false);
  // Live target the counter animates down to. Starts at the static fallback and
  // is replaced once the real signup count arrives; the rAF tick reads the ref
  // so an in-flight animation retargets without restarting.
  const targetRef = useRef(SEATS_LEFT);
  const settledRef = useRef(false);

  // Fetch the real seats-left from Supabase-backed count and retarget the counter.
  useEffect(() => {
    let alive = true;
    fetch('/api/waitlist', { headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data?.live || typeof data.count !== 'number') return;
        const next = seatsLeftFromCount(data.count);
        targetRef.current = next;
        // If the intro animation already settled (and the seat isn't claimed),
        // snap the displayed number to the freshly-fetched target.
        if (settledRef.current && !claimedRef.current) setSeats(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const DURATION = 2200;
    let raf = 0;
    let startTs = 0;

    const tick = (ts: number) => {
      if (!startTs) startTs = ts;
      const t = Math.min(1, (ts - startTs) / DURATION);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const target = targetRef.current;
      const floor = claimedRef.current ? target - 1 : target;
      const value = Math.round(SEATS_START - (SEATS_START - target) * eased);
      setSeats(Math.max(floor, Math.min(SEATS_START, value)));
      if (t < 1) raf = requestAnimationFrame(tick);
      else {
        settledRef.current = true;
        setSeats(floor);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  function claimSeat() {
    claimedRef.current = true;
    setClaimed(true);
    setSeats(Math.max(0, targetRef.current - 1));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === 'loading' || status === 'done') return;
    if (!EMAIL_RE.test(email.trim())) {
      setError('Enter a valid email.');
      setStatus('error');
      return;
    }
    setStatus('loading');
    setError('');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          roles: picked,
          name: name ?? '',
          business: business ?? '',
          contact: contact ?? '',
          selected: selected ?? [],
          rejected: rejected ?? [],
        }),
      });
      if (!res.ok) throw new Error('failed');
      setStatus('done');
      claimSeat();
    } catch {
      // Don't punish the visitor for a backend hiccup — still confirm.
      setStatus('done');
      claimSeat();
    }
  }

  return (
    <div className="jp-waitlist">
      <div aria-hidden className="jp-intro__glow--fuchsia" />
      <div aria-hidden className="jp-intro__glow--cyan" />

      {claimed && <ConfettiBurst />}

      <div className="jp-waitlist__head">
        <span className="jp-eyebrow">
          <Sparkles className="jp-eyebrow__icon" strokeWidth={2.5} />
          Early access
        </span>

        <div className="jp-seats-wrap">
          <motion.div
            animate={claimed ? { scale: [1, 1.18, 1] } : {}}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className={`jp-seats${claimed ? ' jp-seats--claimed' : ''}`}
          >
            {seats.toLocaleString()}
          </motion.div>
          <p className="jp-seats__label">seats left</p>
        </div>
      </div>

      <div className="jp-waitlist__body">
        <h3 className="jp-waitlist__title">{status === 'done' ? "You're in! 🎉" : 'Save your spot'}</h3>
        <p className="jp-waitlist__sub">
          {status === 'done'
            ? `Seat reserved — we'll reach out when Pixie opens up${picked > 0 ? ` — starting with your ${picked} pick${picked === 1 ? '' : 's'}.` : '.'}`
            : 'Drop your email to claim early access to Pixie.'}
        </p>

        {status !== 'done' ? (
          <form onSubmit={handleSubmit} className="jp-emailrow-form">
            <div className="jp-emailrow">
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === 'error') setStatus('idle');
                }}
                placeholder="you@business.com"
                aria-label="Email address"
                className="jp-emailrow__input"
              />
              <button type="submit" disabled={status === 'loading'} className="jp-emailrow__btn">
                {status === 'loading' ? (
                  <Loader2 className="jp-spin" />
                ) : (
                  <>
                    Join
                    <ArrowRight strokeWidth={2.5} />
                  </>
                )}
              </button>
            </div>
            {status === 'error' && <p className="jp-error">{error}</p>}
          </form>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 320, damping: 18 }}
            className="jp-reserved"
          >
            <PartyPopper strokeWidth={2.5} />
            Spot reserved
            <Check strokeWidth={3} />
          </motion.div>
        )}
      </div>
    </div>
  );
}
