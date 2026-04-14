import config from '../../site-config.json';
import Nav from '../components/Nav';
import Hero from '../components/Hero';
import Services from '../components/Services';
import About from '../components/About';
import Footer from '../components/Footer';

export default function Home() {
  return (
    <main>
      <Nav businessName={config.businessName} primaryColor={config.primaryColor} />
      <Hero
        businessName={config.businessName}
        headline={config.headline}
        tagline={config.tagline}
        ctaButton={config.ctaButton}
        primaryColor={config.primaryColor}
        accentColor={config.accentColor}
      />
      <Services title={config.servicesTitle} services={config.salonServices} primaryColor={config.primaryColor} />
      <About
        title={config.aboutTitle}
        text={config.aboutText}
        primaryColor={config.primaryColor}
        instagramHandle={config.instagramHandle}
      />
      <Footer businessName={config.businessName} tagline={config.footerTagline} instagramHandle={config.instagramHandle} />
    </main>
  );
}
