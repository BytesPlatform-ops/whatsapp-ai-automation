export default function Services({ title, services, primaryColor }) {
  if (!services || services.length === 0) return null;
  return (
    <section style={{ padding: '80px 24px', background: '#fff' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h2 className="display" style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, textAlign: 'center', marginBottom: 48 }}>
          {title || 'Our Services'}
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {services.map((s, i) => (
            <div
              key={i}
              style={{
                padding: '24px 28px',
                background: '#faf8f6',
                borderRadius: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 16,
              }}
            >
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{s.name}</h3>
                <p style={{ fontSize: 13, color: '#888' }}>{s.durationMinutes} min</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: primaryColor, marginBottom: 8 }}>{s.priceText || '—'}</p>
                <a
                  href="/booking"
                  style={{ fontSize: 12, color: primaryColor, fontWeight: 600, textDecoration: 'none' }}
                >
                  Book →
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
