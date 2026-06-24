'use client';

import { forwardRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import type { ServiceConfig } from '@/lib/pixieServices';
import { PackageSelector } from './PackageSelector';
import { AddOnSelector } from './AddOnSelector';

/**
 * SetupRequestForm — the inline, low-friction "start setup" section (never the
 * word "checkout"). Owns the whole request state: the main package is implied,
 * add-ons + their follow-ups are optional, and only Name + Email are required.
 * Submits to /api/pixie-request (FormSubmit-backed email). Renders a success
 * card on 200, an inline error otherwise — it never fakes success.
 */

type Status = 'idle' | 'submitting' | 'success' | 'error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const SetupRequestForm = forwardRef<HTMLElement, { config: ServiceConfig }>(
  function SetupRequestForm({ config }, ref) {
    const reduce = useReducedMotion();

    const [selected, setSelected] = useState<string[]>([]);
    const [followUps, setFollowUps] = useState<Record<string, string>>({});
    const [fields, setFields] = useState({
      contactName: '',
      email: '',
      businessName: '',
      link: '',
      notes: '',
    });
    const [status, setStatus] = useState<Status>('idle');
    const [error, setError] = useState<string>('');

    const toggleAddOn = (id: string) =>
      setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

    const setFollowUp = (id: string, value: string) =>
      setFollowUps((prev) => ({ ...prev, [id]: value }));

    const update = (key: keyof typeof fields, value: string) =>
      setFields((prev) => ({ ...prev, [key]: value }));

    async function onSubmit(e: React.FormEvent) {
      e.preventDefault();
      setError('');

      if (!fields.contactName.trim()) {
        setError('Please add your name.');
        return;
      }
      if (!EMAIL_RE.test(fields.email.trim())) {
        setError('Please add a valid email so we can send your setup.');
        return;
      }

      setStatus('submitting');

      // Only submit follow-up answers for add-ons that are actually selected.
      const addOnFollowUps: Record<string, string> = {};
      for (const id of selected) if (followUps[id]) addOnFollowUps[id] = followUps[id];
      const selectedTitles = selected
        .map((id) => config.addOns.find((a) => a.id === id)?.title || id);

      try {
        const res = await fetch('/api/pixie-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service: config.serviceLabel,
            slug: config.slug,
            packageName: config.packageName,
            emailSubject: config.emailSubject,
            selectedAddOns: selectedTitles,
            addOnFollowUps,
            contactName: fields.contactName.trim(),
            email: fields.email.trim(),
            businessName: fields.businessName.trim(),
            link: fields.link.trim(),
            notes: fields.notes.trim(),
          }),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(data?.error || 'Something went wrong sending your request. Please try again.');
          setStatus('error');
          return;
        }
        setStatus('success');
      } catch {
        setError('Network error — please check your connection and try again.');
        setStatus('error');
      }
    }

    const inputClass =
      'w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-white/35 outline-none transition-colors focus:border-[color:var(--accent)] focus:bg-white/[0.06]';

    if (status === 'success') {
      return (
        <section ref={ref} id="setup" className="relative mx-auto max-w-2xl scroll-mt-24 px-5 py-24 md:px-8">
          <motion.div
            initial={{ opacity: 0, y: reduce ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="rounded-3xl border border-white/12 bg-white/[0.04] p-8 text-center sm:p-12"
          >
            <span
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
              style={{ background: 'var(--accent)' }}
            >
              <Check className="h-8 w-8" style={{ color: '#06110c' }} strokeWidth={3} />
            </span>
            <h2 className="mt-6 font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              Your request is in.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/65">
              Pixie has your {config.serviceLabel} setup details{selected.length ? ' and add-ons' : ''}. We&apos;ll be
              in touch at <span className="font-semibold text-white">{fields.email}</span> shortly.
            </p>
            <a
              href="/"
              className="mt-7 inline-flex h-12 items-center justify-center rounded-full border border-white/15 px-6 text-sm font-semibold text-white/85 transition-colors hover:text-white"
            >
              Back to Pixie
            </a>
          </motion.div>
        </section>
      );
    }

    return (
      <section ref={ref} id="setup" className="relative mx-auto max-w-2xl scroll-mt-24 px-5 py-20 sm:py-24 md:px-8">
        <div className="mb-8 text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--soft)' }}>
            START WITH THIS
          </span>
          <h2 className="mt-3 font-display text-[clamp(1.9rem,4vw,2.75rem)] font-extrabold tracking-tight text-white">
            Build your Pixie setup
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-white/55">
            Choose your setup, add anything extra, tell us where to send it.
          </p>
        </div>

        <div className="space-y-6">
          <PackageSelector name={config.packageName} description={config.packageDesc} />

          <AddOnSelector
            addOns={config.addOns}
            selected={selected}
            followUps={followUps}
            onToggle={toggleAddOn}
            onFollowUp={setFollowUp}
          />

          <form onSubmit={onSubmit} className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
            <h3 className="font-display text-lg font-bold text-white">Where should we send it?</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="pf-name" className="mb-1.5 block text-xs font-medium text-white/60">
                  Name
                </label>
                <input
                  id="pf-name"
                  type="text"
                  required
                  autoComplete="name"
                  value={fields.contactName}
                  onChange={(e) => update('contactName', e.target.value)}
                  className={inputClass}
                  placeholder="Your name"
                />
              </div>
              <div>
                <label htmlFor="pf-email" className="mb-1.5 block text-xs font-medium text-white/60">
                  Email
                </label>
                <input
                  id="pf-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={fields.email}
                  onChange={(e) => update('email', e.target.value)}
                  className={inputClass}
                  placeholder="you@business.com"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="pf-business" className="mb-1.5 block text-xs font-medium text-white/60">
                  Business name <span className="text-white/30">(optional)</span>
                </label>
                <input
                  id="pf-business"
                  type="text"
                  autoComplete="organization"
                  value={fields.businessName}
                  onChange={(e) => update('businessName', e.target.value)}
                  className={inputClass}
                  placeholder="Your business"
                />
              </div>
              <div>
                <label htmlFor="pf-link" className="mb-1.5 block text-xs font-medium text-white/60">
                  Website or social link <span className="text-white/30">(optional)</span>
                </label>
                <input
                  id="pf-link"
                  type="text"
                  value={fields.link}
                  onChange={(e) => update('link', e.target.value)}
                  className={inputClass}
                  placeholder="yoursite.com / @handle"
                />
              </div>
            </div>

            <div>
              <label htmlFor="pf-notes" className="mb-1.5 block text-xs font-medium text-white/60">
                Short note <span className="text-white/30">(optional)</span>
              </label>
              <textarea
                id="pf-notes"
                rows={3}
                value={fields.notes}
                onChange={(e) => update('notes', e.target.value)}
                className={`${inputClass} resize-none`}
                placeholder="Anything Pixie should know to get started?"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={status === 'submitting'}
              className="group relative inline-flex h-[54px] w-full items-center justify-center gap-2 overflow-hidden rounded-full px-8 text-sm font-bold tracking-wide transition-transform hover:-translate-y-0.5 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
              style={{
                background: 'var(--accent)',
                color: '#06110c',
                boxShadow: '0 18px 50px color-mix(in srgb, var(--accent) 30%, transparent)',
              }}
            >
              {status === 'submitting' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Sending…
                </>
              ) : (
                config.submitLabel
              )}
            </button>
            <p className="text-center text-[11px] text-white/40">No payment now — this just starts your setup.</p>
          </form>
        </div>
      </section>
    );
  },
);
