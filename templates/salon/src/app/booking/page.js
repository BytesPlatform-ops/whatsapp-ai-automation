import config from '../../../site-config.json';
import Nav from '../../components/Nav';
import Footer from '../../components/Footer';
import BookingWidget from '../../components/BookingWidget';

export default function BookingPage() {
  const isEmbed = config.bookingMode === 'embed' && config.bookingUrl;
  return (
    <main>
      <Nav businessName={config.businessName} primaryColor={config.primaryColor} />

      <section style={{ padding: '64px 24px 24px', textAlign: 'center' }}>
        <h1 className="display" style={{ fontSize: 48, fontWeight: 800 }}>Book an Appointment</h1>
        <p style={{ color: '#666', marginTop: 12 }}>
          {isEmbed ? 'Scheduled through our booking partner.' : `Timezone: ${config.timezone}. Free cancellation up to 24 hours before.`}
        </p>
      </section>

      <section style={{ padding: '0 24px 80px', maxWidth: 860, margin: '0 auto' }}>
        {isEmbed ? (
          <iframe
            src={config.bookingUrl}
            style={{ width: '100%', minHeight: 720, border: '1px solid #eee', borderRadius: 16 }}
            title="Booking"
          />
        ) : (
          <BookingWidget
            apiBaseUrl={config.apiBaseUrl}
            siteId={config.siteId}
            services={config.salonServices}
            timezone={config.timezone}
            primaryColor={config.primaryColor}
          />
        )}
      </section>

      <Footer businessName={config.businessName} tagline={config.footerTagline} instagramHandle={config.instagramHandle} />
    </main>
  );
}
