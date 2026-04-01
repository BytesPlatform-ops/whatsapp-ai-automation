import config from '../../site-config.json';
import Hero from '../components/Hero';
import Services from '../components/Services';
import About from '../components/About';
import Contact from '../components/Contact';
import Footer from '../components/Footer';

export default function Home() {
  return (
    <main>
      <Hero
        businessName={config.businessName}
        headline={config.headline}
        tagline={config.tagline}
        ctaButton={config.ctaButton}
        primaryColor={config.primaryColor}
        accentColor={config.accentColor}
      />
      <Services
        title={config.servicesTitle}
        services={config.services}
        primaryColor={config.primaryColor}
      />
      <About
        title={config.aboutTitle}
        text={config.aboutText}
        primaryColor={config.primaryColor}
      />
      <Contact
        ctaTitle={config.ctaTitle}
        ctaText={config.ctaText}
        ctaButton={config.ctaButton}
        email={config.contactEmail}
        phone={config.contactPhone}
        address={config.contactAddress}
        primaryColor={config.primaryColor}
        accentColor={config.accentColor}
      />
      <Footer
        businessName={config.businessName}
        tagline={config.footerTagline}
        primaryColor={config.primaryColor}
      />
    </main>
  );
}
