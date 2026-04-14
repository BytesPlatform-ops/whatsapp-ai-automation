export default function About({ title, text, primaryColor, instagramHandle }) {
  return (
    <section style={{ padding: '80px 24px', background: '#faf8f6' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
        <h2 className="display" style={{ fontSize: 'clamp(32px, 5vw, 44px)', fontWeight: 800, marginBottom: 24 }}>
          {title || 'About Us'}
        </h2>
        <p style={{ fontSize: 17, color: '#555', lineHeight: 1.8 }}>{text}</p>
        {instagramHandle ? (
          <p style={{ marginTop: 32 }}>
            <a
              href={`https://instagram.com/${instagramHandle}`}
              target="_blank"
              rel="noopener"
              style={{ color: primaryColor, fontWeight: 600, textDecoration: 'none' }}
            >
              Follow us on Instagram @{instagramHandle}
            </a>
          </p>
        ) : null}
      </div>
    </section>
  );
}
