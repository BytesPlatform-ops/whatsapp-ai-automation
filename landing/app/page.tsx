import { Navigation } from '@/components/sections/Navigation';
import { Hero } from '@/components/sections/Hero';
import { TrustStrip } from '@/components/sections/TrustStrip';
import { HowItWorks } from '@/components/sections/HowItWorks';
import { Services } from '@/components/sections/Services';
import { WhyUs } from '@/components/sections/WhyUs';
import { Testimonials } from '@/components/sections/Testimonials';
import { FAQ } from '@/components/sections/FAQ';
import { FinalCTA } from '@/components/sections/FinalCTA';
import { Footer } from '@/components/sections/Footer';
import { FloatingWhatsApp } from '@/components/sections/FloatingWhatsApp';

export default function Page() {
  return (
    <>
      <Navigation />
      <main>
        <Hero />
        <TrustStrip />
        <HowItWorks />
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
