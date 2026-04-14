export default function Nav({ businessName, primaryColor }) {
  const pages = [
    { label: 'Home', href: '/' },
    { label: 'Services', href: '/services' },
    { label: 'Booking', href: '/booking' },
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' },
  ];
  return (
    <nav style={{ padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <a href="/" className="display" style={{ fontSize: 24, fontWeight: 700, color: primaryColor, textDecoration: 'none' }}>
        {businessName}
      </a>
      <div style={{ display: 'flex', gap: 28 }}>
        {pages.map((p) => (
          <a key={p.href} href={p.href} style={{ color: '#1a1a1a', textDecoration: 'none', fontSize: 15, fontWeight: 500 }}>
            {p.label}
          </a>
        ))}
        <a
          href="/booking"
          style={{
            background: primaryColor,
            color: '#fff',
            padding: '10px 22px',
            borderRadius: 999,
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Book Now
        </a>
      </div>
    </nav>
  );
}
