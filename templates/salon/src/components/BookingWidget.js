'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Native booking widget. Talks to the main bot backend at `${apiBaseUrl}/api/booking/${siteId}/...`.
 * Two-step flow:
 *   1. Pick service + date → GET /availability → show open slots
 *   2. Pick slot + fill name/email/phone → POST / → confirmation screen
 *
 * This component is duplicated, as a reference, into the static-HTML build the
 * deployer produces. Keep both in sync when the flow changes.
 */
export default function BookingWidget({ apiBaseUrl, siteId, services, timezone, primaryColor }) {
  const [service, setService] = useState(services?.[0]?.name || '');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [chosenSlot, setChosenSlot] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' });
  const [confirmation, setConfirmation] = useState(null);
  const [error, setError] = useState(null);
  const aborter = useRef(null);

  async function loadSlots(svc, d) {
    if (!svc || !d) return;
    setLoading(true);
    setError(null);
    setChosenSlot(null);
    if (aborter.current) aborter.current.abort();
    aborter.current = new AbortController();
    try {
      const url = `${apiBaseUrl}/api/booking/${siteId}/availability?service=${encodeURIComponent(svc)}&date=${d}`;
      const res = await fetch(url, { signal: aborter.current.signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load availability');
      setSlots(json.slots || []);
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSlots(service, date); }, [service, date]);

  async function submit() {
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/booking/${siteId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service,
          startAt: chosenSlot,
          customerName: form.name,
          customerEmail: form.email,
          customerPhone: form.phone,
          notes: form.notes,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Booking failed');
      setConfirmation(json);
    } catch (err) {
      setError(err.message);
    }
  }

  if (confirmation) {
    return (
      <div style={{ padding: 32, background: '#f7faf4', borderRadius: 16, textAlign: 'center' }}>
        <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>Booked!</h3>
        <p style={{ color: '#555' }}>Check your email for a confirmation and cancellation link.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <select value={service} onChange={(e) => setService(e.target.value)} style={{ padding: 12, borderRadius: 8, border: '1px solid #ddd' }}>
          {(services || []).map((s) => (
            <option key={s.name} value={s.name}>{s.name} ({s.durationMinutes}m)</option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: 12, borderRadius: 8, border: '1px solid #ddd' }} />
      </div>

      {loading ? <p>Loading slots…</p> : null}
      {error ? <p style={{ color: '#c00' }}>{error}</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginBottom: 20 }}>
        {slots.map((s) => (
          <button
            key={s.startAt}
            type="button"
            onClick={() => setChosenSlot(s.startAt)}
            style={{
              padding: 10,
              borderRadius: 8,
              border: chosenSlot === s.startAt ? `2px solid ${primaryColor}` : '1px solid #ddd',
              background: chosenSlot === s.startAt ? primaryColor : '#fff',
              color: chosenSlot === s.startAt ? '#fff' : '#1a1a1a',
              cursor: 'pointer',
            }}
          >
            {s.label}
          </button>
        ))}
        {!loading && slots.length === 0 ? <p style={{ gridColumn: '1 / -1', color: '#888' }}>No open slots this day.</p> : null}
      </div>

      {chosenSlot ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ padding: 12, borderRadius: 8, border: '1px solid #ddd' }} />
          <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ padding: 12, borderRadius: 8, border: '1px solid #ddd' }} />
          <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={{ padding: 12, borderRadius: 8, border: '1px solid #ddd' }} />
          <textarea placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ padding: 12, borderRadius: 8, border: '1px solid #ddd', minHeight: 60 }} />
          <button
            type="button"
            onClick={submit}
            style={{ background: primaryColor, color: '#fff', padding: 14, border: 'none', borderRadius: 999, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
          >
            Confirm booking ({timezone})
          </button>
        </div>
      ) : null}
    </div>
  );
}
