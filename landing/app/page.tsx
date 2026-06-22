import type { Metadata } from 'next';
import { PixieMasterHero } from '@/components/pixie/master-hero';
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

export default function Page() {
  return (
    <>
      {/* Master flying-robot hero — includes its own PremiumNavbar AND the new
          PixieFooter as its final landing. Every Join Pixie CTA now navigates
          to the dedicated /join-pixie onboarding page (no modal/overlay). */}
      <PixieMasterHero />

      {/* ── LEGACY WhatsApp-focused sections — preserved, not deleted. Remove
          everything below once the redesign is signed off. ──────────────── */}
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
  );
}
