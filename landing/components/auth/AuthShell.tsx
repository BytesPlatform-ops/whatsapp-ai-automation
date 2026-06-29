import Link from 'next/link';
import { Sparkles, Headset, Globe, Search, Clapperboard, Megaphone, ShieldCheck } from 'lucide-react';

const HIGHLIGHTS = [
  { icon: Headset, label: 'AI Receptionist', tint: '#34d399' },
  { icon: Globe, label: 'Website Builder', tint: '#60a5fa' },
  { icon: Megaphone, label: 'Social Marketing', tint: '#f472b6' },
  { icon: Clapperboard, label: 'AI Influencer', tint: '#fbbf24' },
  { icon: Search, label: 'SEO Audit', tint: '#22d3ee' },
];

/**
 * Premium split-screen auth shell. Left: a branded, animated gradient panel that
 * sells the product. Right: the form (children). Mobile collapses to just the
 * form with a compact brand header.
 */
export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  altPrompt,
  altHref,
  altLabel,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  altPrompt: string;
  altHref: string;
  altLabel: string;
}) {
  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#05070d] text-white lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* ── Brand panel ───────────────────────────────────────────────── */}
      <aside className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 90% at 18% 12%, rgba(37,211,102,0.22), transparent 55%), radial-gradient(90% 80% at 95% 100%, rgba(56,189,248,0.16), transparent 60%), linear-gradient(160deg, #07130f 0%, #060a14 55%, #05070d 100%)',
          }}
        />
        <div className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-[#25D366]/20 blur-[120px]" />
        <div className="pointer-events-none absolute right-0 top-10 h-64 w-64 rounded-full bg-sky-400/10 blur-[120px]" />

        <Link href="/" className="relative z-10 inline-flex items-center gap-2.5 font-display text-lg font-extrabold tracking-tight">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#25D366] to-[#22d3ee] text-[#05070d] shadow-[0_0_30px_-6px_rgba(37,211,102,0.7)]">
            <Sparkles size={18} strokeWidth={2.5} />
          </span>
          Pixie
        </Link>

        <div className="relative z-10 max-w-md">
          <h2 className="font-display text-[2.6rem] font-extrabold leading-[1.05] tracking-tight">
            Your entire AI
            <br />
            workforce, in
            <br />
            <span className="bg-gradient-to-r from-[#25D366] to-[#7dd3fc] bg-clip-text text-transparent">one dashboard.</span>
          </h2>
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-white/55">
            Receptionist, website builder, SEO, social content, and an AI influencer — every Pixie service in a single command center.
          </p>

          <div className="mt-9 space-y-2.5">
            {HIGHLIGHTS.map(({ icon: Icon, label, tint }) => (
              <div key={label} className="flex items-center gap-3 text-sm text-white/75">
                <span
                  className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04]"
                  style={{ color: tint }}
                >
                  <Icon size={16} strokeWidth={2.2} />
                </span>
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-xs text-white/40">
          <ShieldCheck size={14} /> Bank-grade auth · your data stays yours
        </div>
      </aside>

      {/* ── Form panel ────────────────────────────────────────────────── */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-5 py-12 sm:px-8">
        <div className="pointer-events-none absolute inset-0 lg:hidden" style={{ background: 'radial-gradient(100% 60% at 50% 0%, rgba(37,211,102,0.12), transparent 60%)' }} />
        <div className="relative w-full max-w-[420px]">
          {/* mobile brand */}
          <Link href="/" className="mb-8 inline-flex items-center gap-2 font-display text-base font-extrabold lg:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#25D366] to-[#22d3ee] text-[#05070d]">
              <Sparkles size={16} strokeWidth={2.5} />
            </span>
            Pixie
          </Link>

          <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#25D366]">{eyebrow}</p>
          <h1 className="mt-2 font-display text-[2rem] font-extrabold leading-tight tracking-tight">{title}</h1>
          <p className="mt-2 text-[15px] text-white/50">{subtitle}</p>

          <div className="mt-8">{children}</div>

          <p className="mt-7 text-center text-sm text-white/45">
            {altPrompt}{' '}
            <Link href={altHref} className="font-semibold text-[#25D366] underline-offset-4 hover:underline">
              {altLabel}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
