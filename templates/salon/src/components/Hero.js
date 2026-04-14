export default function Hero({ businessName, headline, tagline, ctaButton, primaryColor, accentColor }) {
  return (
    <section
      style={{
        minHeight: '80vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 120%)`,
        color: '#fff',
        padding: '80px 24px',
      }}
    >
      <div className="fade-up" style={{ maxWidth: 860 }}>
        <p style={{ letterSpacing: 6, fontSize: 12, textTransform: 'uppercase', opacity: 0.8, marginBottom: 24 }}>{businessName}</p>
        <h1 className="display" style={{ fontSize: 'clamp(40px, 7vw, 80px)', fontWeight: 900, lineHeight: 1.05, marginBottom: 24 }}>
          {headline}
        </h1>
        <p style={{ fontSize: 18, opacity: 0.9, maxWidth: 620, margin: '0 auto 40px', lineHeight: 1.6 }}>{tagline}</p>
        <a
          href="/booking"
          style={{
            display: 'inline-block',
            background: '#fff',
            color: primaryColor,
            padding: '16px 36px',
            borderRadius: 999,
            textDecoration: 'none',
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          {ctaButton || 'Book Now'}
        </a>
      </div>
    </section>
  );
}
