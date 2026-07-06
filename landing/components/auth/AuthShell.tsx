import Link from 'next/link';
import { Headset, Globe, TrendingUp, Megaphone, Clapperboard, ShieldCheck } from 'lucide-react';
import { BrandAvatar } from './BrandAvatar';

const FEATURES = [
  { icon: Headset, label: 'AI Receptionist', tint: '#34d399' },
  { icon: Globe, label: 'Website Builder', tint: '#60a5fa' },
  { icon: TrendingUp, label: 'SEO Growth', tint: '#22d3ee' },
  { icon: Megaphone, label: 'Marketing Agent', tint: '#f472b6' },
  { icon: Clapperboard, label: 'Content Creator', tint: '#fbbf24' },
];

/**
 * Premium split-screen auth shell. Left: a branded gradient panel that sells the
 * product — Pixie mascot brand mark, balanced hero copy, a grid of feature
 * cards, and a trust badge. Right: the form (children). Mobile collapses to just
 * the form with a compact brand header. No auth logic lives here.
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
    <main className="relative min-h-screen w-full overflow-hidden bg-[#02040a] text-white lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* ── Brand panel ───────────────────────────────────────────────── */}
      <aside className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 15% 18%, rgba(34,197,94,0.28), transparent 36%), radial-gradient(circle at 78% 88%, rgba(6,182,212,0.18), transparent 38%), linear-gradient(135deg, #03150c 0%, #061019 52%, #02040a 100%)',
          }}
        />
        <div className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-[#25D366]/15 blur-[130px]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-64 w-64 rounded-full bg-cyan-400/10 blur-[130px]" />

        {/* Brand lockup */}
        <Link href="/" className="group relative z-10 inline-flex items-center gap-4">
          <BrandAvatar size={64} />
          <span className="flex flex-col leading-none">
            <span className="font-display text-[2rem] font-extrabold tracking-[-0.02em] text-white [text-shadow:0_1px_20px_rgba(37,211,102,0.25)]">
              Pixie
            </span>
            <span className="mt-1.5 text-[12px] font-medium uppercase tracking-[0.22em] text-white/45">
              AI workspace
            </span>
          </span>
        </Link>

        {/* Hero copy + features */}
        <div className="relative z-10">
          <h2
            className="font-display font-extrabold tracking-[-0.03em] text-white"
            style={{ fontSize: 'clamp(2.4rem, 3.4vw, 3.5rem)', lineHeight: 1.02, maxWidth: '15ch' }}
          >
            Run your business with{' '}
            <span className="bg-gradient-to-r from-[#25D366] to-[#7dd3fc] bg-clip-text text-transparent">Pixie.</span>
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-white/60" style={{ maxWidth: '30ch' }}>
            Website, receptionist, SEO, content, and marketing — all from one AI workspace.
          </p>

          <div className="mt-9 grid max-w-md grid-cols-2 gap-2.5">
            {FEATURES.map(({ icon: Icon, label, tint }, i) => (
              <div
                key={label}
                className={`group flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 backdrop-blur-sm transition-colors hover:border-white/[0.16] hover:bg-white/[0.06] ${
                  i === FEATURES.length - 1 ? 'col-span-2' : ''
                }`}
              >
                <span
                  className="grid h-8 w-8 flex-none place-items-center rounded-lg border border-white/10 bg-white/[0.04] transition-transform group-hover:scale-105"
                  style={{ color: tint }}
                >
                  <Icon size={16} strokeWidth={2.2} />
                </span>
                <span className="text-[14px] font-medium text-white/80">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Trust badge */}
        <div className="relative z-10 inline-flex w-fit items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-[13px] text-white/55">
          <ShieldCheck size={15} className="text-[#25D366]" />
          Secure sign-in · Your workspace stays private
        </div>
      </aside>

      {/* ── Form panel ────────────────────────────────────────────────── */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-5 py-12 sm:px-8">
        <div className="pointer-events-none absolute inset-0 lg:hidden" style={{ background: 'radial-gradient(100% 60% at 50% 0%, rgba(37,211,102,0.12), transparent 60%)' }} />
        <div className="relative w-full max-w-[420px]">
          {/* mobile brand */}
          <Link href="/" className="mb-8 inline-flex items-center gap-3 lg:hidden">
            <BrandAvatar size={50} />
            <span className="flex flex-col leading-none">
              <span className="font-display text-[1.35rem] font-extrabold tracking-[-0.02em]">Pixie</span>
              <span className="mt-1 text-[10.5px] font-medium uppercase tracking-[0.22em] text-white/45">
                AI workspace
              </span>
            </span>
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
