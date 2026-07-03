import type { Metadata } from 'next';
import { PixieMasterHero } from '@/components/pixie/master-hero';
import { HomeAuthCorner } from '@/components/auth/HomeAuthCorner';
import { Hero } from '@/components/sections/Hero';
import { TrustStrip } from '@/components/sections/TrustStrip';
import { HowItWorks } from '@/components/sections/HowItWorks';
import { ExamplesPreview } from '@/components/sections/ExamplesPreview';
import { SeoAuditFeature } from '@/components/sections/SeoAuditFeature';
import { Services } from '@/components/sections/Services';
import { WhyUs } from '@/components/sections/WhyUs';
import { Testimonials } from '@/components/sections/Testimonials';
import { FAQ } from '@/components/sections/FAQ';
import { FinalCTA } from '@/components/sections/FinalCTA';
import { Footer } from '@/components/sections/Footer';
import { FloatingWhatsApp } from '@/components/sections/FloatingWhatsApp';

export const metadata: Metadata = {
  title: 'WhatsApp Website Builder — Build a Site by Chat',
  description:
    'Pixie is a WhatsApp website builder. Text our AI bot for a live website, marketing ads, or a free SEO audit in 60 seconds.',
  alternates: { canonical: 'https://www.pixiebot.co' },
};

// TEMP: Pixie products are not live yet, so the older WhatsApp website-builder
// story (and its floating WhatsApp button + legacy footer) is hidden from the
// rendered site. Nothing is deleted — flip this flag back to `true` to restore
// the full legacy page once the products ship.
const SHOW_LEGACY_WHATSAPP_SECTIONS = false;

export default function Page() {
  return (
    <>
      {/* Single floating primary CTA (desktop) — "Join Pixie" → /login when
          signed out, "Enter Pixie Lab" → /pixie-lab/for-you when signed in. The
          hero navbar is disabled, so this is the homepage's one auth entry
          point. Mobile uses the hero/menu CTA instead. */}
      <HomeAuthCorner />

      {/* Master flying-robot hero — includes its own PremiumNavbar AND the new
          PixieFooter as its final landing. Every Join Pixie CTA now navigates
          to the dedicated /join-pixie onboarding page (no modal/overlay).
          With the legacy sections disabled, the site visually ends here. */}
      <PixieMasterHero />

      {/* ── LEGACY WhatsApp-focused sections — preserved, not deleted. Gated
          behind SHOW_LEGACY_WHATSAPP_SECTIONS so they restore in one edit. ── */}
      {SHOW_LEGACY_WHATSAPP_SECTIONS && (
        <>
          <main>
            <Hero />
            <TrustStrip />
            <HowItWorks />
            <ExamplesPreview />
            <SeoAuditFeature />
            <Services />
            <WhyUs />
            <Testimonials />
            <FAQ />
            <FinalCTA />
          </main>
          <Footer />
          <FloatingWhatsApp />
        </>
      )}
    </>
  );
}
