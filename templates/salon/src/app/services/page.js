import config from '../../../site-config.json';
import Nav from '../../components/Nav';
import Services from '../../components/Services';
import Footer from '../../components/Footer';

export default function ServicesPage() {
  return (
    <main>
      <Nav businessName={config.businessName} primaryColor={config.primaryColor} />
      <section style={{ padding: '64px 24px 16px', textAlign: 'center' }}>
        <h1 className="display" style={{ fontSize: 48, fontWeight: 800 }}>{config.servicesTitle || 'Our Services'}</h1>
        <p style={{ color: '#666', marginTop: 12 }}>Prices shown in {config.currency || 'EUR'}. Book below or give us a call.</p>
      </section>
      <Services title="" services={config.salonServices} primaryColor={config.primaryColor} />
      <Footer businessName={config.businessName} tagline={config.footerTagline} instagramHandle={config.instagramHandle} />
    </main>
  );
}
