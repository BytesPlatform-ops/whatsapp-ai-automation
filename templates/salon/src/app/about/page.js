import config from '../../../site-config.json';
import Nav from '../../components/Nav';
import About from '../../components/About';
import Footer from '../../components/Footer';

export default function AboutPage() {
  return (
    <main>
      <Nav businessName={config.businessName} primaryColor={config.primaryColor} />
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
