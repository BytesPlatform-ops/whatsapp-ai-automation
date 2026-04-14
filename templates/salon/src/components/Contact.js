export default function Contact({ email, phone, address, hours, primaryColor }) {
  const dayLabel = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  return (
    <section style={{ padding: '80px 24px', background: '#fff' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48 }}>
        <div>
          <h2 className="display" style={{ fontSize: 32, fontWeight: 800, marginBottom: 16 }}>Visit Us</h2>
          {address ? <p style={{ color: '#555', marginBottom: 10 }}>{address}</p> : null}
          {phone ? <p><a href={`tel:${phone}`} style={{ color: primaryColor }}>{phone}</a></p> : null}
          {email ? <p><a href={`mailto:${email}`} style={{ color: primaryColor }}>{email}</a></p> : null}
        </div>
        {hours ? (
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Opening Hours</h3>
            <ul style={{ listStyle: 'none', padding: 0, color: '#555' }}>
              {days.map((d) => (
                <li key={d} style={{ padding: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{dayLabel[d]}</span>
                  <span>{(hours[d] || []).length === 0 ? 'Closed' : hours[d].map((w) => `${w.open}–${w.close}`).join(', ')}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
