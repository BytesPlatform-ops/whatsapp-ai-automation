export default function Footer({ businessName, tagline, instagramHandle }) {
  return (
    <footer style={{ background: '#0f0f12', color: '#999', padding: '40px 24px', textAlign: 'center' }}>
      <p className="display" style={{ fontSize: 20, color: '#fff', marginBottom: 8 }}>{businessName}</p>
      {tagline ? <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 16 }}>{tagline}</p> : null}
      {instagramHandle ? (
        <a
          href={`https://instagram.com/${instagramHandle}`}
          target="_blank"
          rel="noopener"
          style={{ color: '#ddd', textDecoration: 'underline', fontSize: 13 }}
        >
          Instagram @{instagramHandle}
        </a>
      ) : null}
      <p style={{ fontSize: 12, opacity: 0.5, marginTop: 24 }}>© {new Date().getFullYear()} {businessName}</p>
    </footer>
  );
}
