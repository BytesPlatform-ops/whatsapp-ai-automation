'use client';

import { JoinPixie } from '@/pixie/JoinPixie';
import { siteConfig } from '@/lib/config';

/**
 * PixieFooter — the new cinematic ending of the Pixie site, placed directly
 * after the Omnichannel/Core experience. The Omni/Core "boss form" settles
 * back into the normal Pixie identity (mint world, not the role rainbow).
 *
 * Desktop: 3 columns — Join Pixie CTA · normal Pixie avatar · Quick Links.
 * Mobile: stacks (CTA → avatar → links → legal). Avatar floats with a soft
 * mint aura (no hard ring). Reduced-motion disables the float/aura.
 */
const QUICK_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'AI Receptionist', href: '/ai-receptionist' },
  { label: 'Website Builder', href: '/website-builder' },
  { label: 'Social Media Marketing', href: '/social-media-marketing' },
  { label: 'AI Influencer', href: '/ai-influencer' },
  { label: 'SEO Audit', href: '/seo-audit' },
  { label: 'Omnichannel AI', href: '/omnichannel-ai' },
  { label: 'Contact', href: `mailto:${siteConfig.supportEmail}` },
];

const MINT = '#66D6BE';

/**
 * `landingZone` (desktop flight): the centre is an empty glow zone — the
 * persistent FlyingRobot flies in and morphs to `normal.png` here, so there's
 * NO duplicate static avatar. Without it (mobile), the centre shows the static
 * normal Pixie image.
 */
export function PixieFooter({ landingZone = false }: { landingZone?: boolean }) {
  return (
    <footer
      className="relative overflow-hidden text-[#F5F7F6]"
      style={{
        background:
          'radial-gradient(circle at 50% 30%, rgba(102,214,190,0.16), transparent 44%), linear-gradient(180deg, #02070a 0%, #05080c 100%)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        minHeight: landingZone ? '88vh' : undefined,
      }}
    >
      {/* Thin mint top line */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(102,214,190,0.5), transparent)' }} />

      <div className="container-page relative grid items-center gap-10 py-16 md:gap-8 md:py-20 lg:grid-cols-[1fr_minmax(280px,0.9fr)_0.8fr]">
        {/* ── Left: Join Pixie CTA ─────────────────────────────────────── */}
        <div className="order-2 text-center lg:order-1 lg:text-left">
          <div
            className="rounded-3xl border p-7 backdrop-blur-xl"
            style={{ borderColor: 'rgba(102,214,190,0.28)', background: 'rgba(102,214,190,0.05)', boxShadow: '0 0 80px -30px rgba(102,214,190,0.4)' }}
          >
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Join Pixie</h2>
            <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-white/65 lg:mx-0">
              Start with one task — a lead, a website, a content idea, an audit, or a customer message. Pixie helps you move from there.
            </p>
            <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <JoinPixie label="Join Pixie" size="lg" />
              <a href="#" className="text-sm font-semibold text-white/70 underline-offset-4 transition-colors hover:text-white hover:underline">
                See how Pixie works
              </a>
            </div>
          </div>
        </div>

        {/* ── Center: Pixie avatar ─────────────────────────────────────────
            Desktop (landingZone): empty landing zone — the persistent flying
            robot flies in + morphs to normal.png here (no duplicate avatar).
            Mobile: static normal Pixie image. */}
        <div className="order-1 flex justify-center lg:order-2">
          {landingZone ? (
            <div aria-hidden className="relative h-[46vh] min-h-[320px] w-full max-w-[380px]">
              {/* soft mint landing glow — the robot settles over this */}
              <div
                className="pixie-footer-aura absolute inset-[14%] rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(102,214,190,0.30), transparent 68%)', filter: 'blur(48px)' }}
              />
              <div className="absolute bottom-[10%] left-1/2 h-6 w-[44%] -translate-x-1/2 rounded-[100%] bg-black/50 blur-2xl" />
            </div>
          ) : (
            <div className="relative flex h-[280px] w-full max-w-[340px] items-center justify-center sm:h-[340px]">
              <div
                aria-hidden
                className="pixie-footer-aura absolute inset-[10%] rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(102,214,190,0.34), transparent 68%)', filter: 'blur(44px)' }}
              />
              <div className="pixie-footer-float relative z-10 flex h-full w-full items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element -- transparent brand avatar */}
                <img
                  src="/images/pixie/forms/normal.png"
                  alt="Pixie AI assistant"
                  className="h-full w-auto max-w-full select-none object-contain drop-shadow-[0_26px_50px_rgba(0,0,0,0.5)]"
                  draggable={false}
                />
              </div>
              <div aria-hidden className="absolute bottom-[6%] left-1/2 h-6 w-[46%] -translate-x-1/2 rounded-[100%] bg-black/55 blur-2xl" />
            </div>
          )}
        </div>

        {/* ── Right: Quick Links ───────────────────────────────────────── */}
        <nav className="order-3 text-center lg:order-3 lg:text-left" aria-label="Footer">
          <h3 className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: MINT }}>Quick Links</h3>
          <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5 lg:grid-cols-1">
            {QUICK_LINKS.map((l) => (
              <li key={l.label}>
                <a href={l.href} className="text-sm font-medium text-white/70 transition-colors hover:text-white">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* ── Bottom bar ───────────────────────────────────────────────── */}
      <div className="border-t border-white/8">
        <div className="container-page flex flex-col items-center justify-between gap-3 py-6 text-xs text-white/45 sm:flex-row">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pixie-logo-white.png" alt="Pixie" className="h-5 w-auto opacity-80" />
            <span>© {new Date().getFullYear()} {siteConfig.brand}. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="/privacy" className="transition-colors hover:text-white/80">Privacy</a>
            <a href={`mailto:${siteConfig.supportEmail}`} className="transition-colors hover:text-white/80">Contact</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
