import config from '../../../site-config.json';
import Nav from '../../components/Nav';
import Contact from '../../components/Contact';
import Footer from '../../components/Footer';

export default function ContactPage() {
  return (
    <main>
      <Nav businessName={config.businessName} primaryColor={config.primaryColor} />
      <Contact
        email={config.contactEmail}
        phone={config.contactPhone}
        address={config.contactAddress}
        hours={config.weeklyHours}
        primaryColor={config.primaryColor}
      />
      <Footer businessName={config.businessName} tagline={config.footerTagline} instagramHandle={config.instagramHandle} />
    </main>
  );
}
