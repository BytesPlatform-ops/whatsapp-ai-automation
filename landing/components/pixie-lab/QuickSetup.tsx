'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';

/**
 * QuickSetup — first-signup onboarding (Part A). Collects the minimum business
 * details Pixie needs to generate meaningful feed cards, marks the user
 * `onboarded` in Supabase user_metadata, then routes to For You. Degrades
 * gracefully when Supabase isn't configured (local/demo): it just routes on.
 */

const GOALS = [
  'Get more customers',
  'Build a website',
  'Answer customers',
  'Create content',
  'Improve SEO',
  'Manage marketing',
  'Set up everything',
];

export function QuickSetup() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    business_name: '',
    industry: '',
    what_they_sell: '',
    city: '',
    website_url: '',
    social_links: '',
    preferred_contact_channel: 'WhatsApp',
    main_goal: GOALS[0],
  });

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (supabaseConfigured()) {
        await createClient().auth.updateUser({ data: { onboarded: true, business_profile: form } });
      }
    } catch {
      /* ignore — still proceed to the Lab */
    }
    router.push('/pixie-lab/dashboard');
    router.refresh();
  }

  return (
    <div className="relative min-h-screen bg-[#0C1512] text-white">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[420px]" style={{ background: 'radial-gradient(80% 100% at 50% 0%, rgba(37,211,102,0.12), transparent 60%)' }} />
      <main className="relative mx-auto max-w-xl px-5 py-14">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#25D366]/25 bg-[#25D366]/10 px-3 py-1 text-[12px] font-semibold text-[#7ef0a8]">
            <Sparkles size={13} /> Quick setup
          </span>
          <h1 className="mt-4 font-display text-[2rem] font-extrabold leading-tight tracking-tight">
            Let Pixie understand your business first.
          </h1>
          <p className="mt-2 text-[15px] text-white/55">Just a few details so Pixie can start finding useful actions.</p>
        </motion.div>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <Field label="Business name" value={form.business_name} onChange={(v) => set('business_name', v)} placeholder="Bean There Coffee" required />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Industry / type" value={form.industry} onChange={(v) => set('industry', v)} placeholder="Café" />
            <Field label="City / country" value={form.city} onChange={(v) => set('city', v)} placeholder="Lahore, PK" />
          </div>
          <Field label="What do you sell?" value={form.what_they_sell} onChange={(v) => set('what_they_sell', v)} placeholder="Specialty coffee & pastries" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Website (if any)" value={form.website_url} onChange={(v) => set('website_url', v)} placeholder="https://…" />
            <Field label="Social links" value={form.social_links} onChange={(v) => set('social_links', v)} placeholder="@beanthere" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Preferred contact" value={form.preferred_contact_channel} onChange={(v) => set('preferred_contact_channel', v)} options={['WhatsApp', 'Web chat', 'Email', 'Phone', 'Instagram']} />
            <Select label="Main goal" value={form.main_goal} onChange={(v) => set('main_goal', v)} options={GOALS} />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#25D366] to-[#22d3ee] px-5 py-3.5 text-[15px] font-bold text-[#02070a] transition-transform active:scale-[0.99] disabled:opacity-70"
          >
            {saving ? <Loader2 size={17} className="animate-spin" /> : <>Enter Pixie Lab <ArrowRight size={16} /></>}
          </button>
        </form>
      </main>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, required }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-white/45">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-2.5 text-[15px] text-white placeholder-white/30 outline-none focus:border-[#25D366]/40"
      />
    </label>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wider text-white/45">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-2.5 text-[15px] text-white outline-none focus:border-[#25D366]/40"
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-[#15211C]">{o}</option>
        ))}
      </select>
    </label>
  );
}
