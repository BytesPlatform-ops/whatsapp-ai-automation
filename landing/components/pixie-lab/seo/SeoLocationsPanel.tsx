'use client';

import { useCallback, useEffect, useState } from 'react';
import { MapPin, Plus, Pencil, Archive, Loader2, CheckCircle2, X } from 'lucide-react';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type { SeoLocation } from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';

const ACCENT = '#14B8A6';

interface LocationFormState {
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  website: string;
}

const EMPTY_FORM: LocationFormState = { name: '', address: '', city: '', state: '', country: '', phone: '', website: '' };

function LocationForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: LocationFormState;
  onSave: (f: LocationFormState) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const set = (k: keyof LocationFormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  return (
    <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5 space-y-4">
      <p className="font-display text-[14px] font-bold text-[var(--pl-text)]">{initial.name ? 'Edit Location' : 'Add Location'}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ['name', 'Business Name *'],
          ['address', 'Street Address'],
          ['city', 'City'],
          ['state', 'State / Region'],
          ['country', 'Country'],
          ['phone', 'Phone'],
          ['website', 'Website'],
        ] as [keyof LocationFormState, string][]).map(([key, label]) => (
          <div key={key} className={key === 'name' ? 'sm:col-span-2' : ''}>
            <label className="mb-1 block text-[12px] font-semibold text-[var(--pl-text-muted)]">{label}</label>
            <input
              value={form[key]}
              onChange={set(key)}
              className="w-full rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[13px] text-[var(--pl-text)] outline-none placeholder:text-[var(--pl-text-muted)] focus:border-[var(--pl-border-strong)]"
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onSave(form)}
          disabled={saving || !form.name.trim()}
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-[#02120f] disabled:opacity-60"
          style={{ background: ACCENT }}
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="rounded-xl border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)]">
          <X size={13} className="mr-1 inline" />Cancel
        </button>
      </div>
    </div>
  );
}

function LocationCard({
  loc,
  onEdit,
  onArchive,
}: {
  loc: SeoLocation;
  onEdit: (loc: SeoLocation) => void;
  onArchive: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-[14px] font-bold text-[var(--pl-text)]">{loc.name}</p>
          {loc.address && (
            <p className="text-[12px] text-[var(--pl-text-muted)]">
              {[loc.address, loc.city, loc.state, loc.country].filter(Boolean).join(', ')}
            </p>
          )}
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
          style={loc.status === 'archived'
            ? { background: 'rgba(100,116,139,0.12)', color: '#64748b' }
            : { background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`, color: ACCENT }}
        >
          {loc.status ?? 'active'}
        </span>
      </div>
      {(loc.phone || loc.website) && (
        <div className="flex flex-wrap gap-3 text-[12px] text-[var(--pl-text-muted)]">
          {loc.phone && <span>{loc.phone}</span>}
          {loc.website && <a href={loc.website} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: ACCENT }}>{loc.website}</a>}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onEdit(loc)}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--pl-border)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)]"
        >
          <Pencil size={11} /> Edit
        </button>
        {loc.status !== 'archived' && (
          <button
            onClick={() => onArchive(loc.id)}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--pl-border)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--pl-text-muted)] transition hover:text-red-500"
          >
            <Archive size={11} /> Archive
          </button>
        )}
      </div>
    </div>
  );
}

export function SeoLocationsPanel() {
  const [status, setStatus] = useState<'loading' | 'done' | 'offline'>('loading');
  const [locations, setLocations] = useState<SeoLocation[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<SeoLocation | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    const env = await seoApi.locations();
    if (!env.backendUp) { setStatus('offline'); return; }
    setLocations(env.locations ?? []);
    setStatus('done');
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(form: LocationFormState) {
    setSaving(true);
    if (editTarget) {
      await seoApi.updateLocation(editTarget.id, form);
    } else {
      await seoApi.createLocation({ name: form.name, address: form.address || null, city: form.city || null, state: form.state || null, country: form.country || null, phone: form.phone || null, website: form.website || null });
    }
    setSaving(false);
    setShowForm(false);
    setEditTarget(null);
    load();
  }

  async function handleArchive(id: string) {
    await seoApi.archiveLocation(id);
    load();
  }

  function openEdit(loc: SeoLocation) {
    setEditTarget(loc);
    setShowForm(true);
  }

  const formInitial: LocationFormState = editTarget
    ? { name: editTarget.name, address: editTarget.address ?? '', city: editTarget.city ?? '', state: editTarget.state ?? '', country: editTarget.country ?? '', phone: editTarget.phone ?? '', website: editTarget.website ?? '' }
    : EMPTY_FORM;

  if (status === 'loading') return <div className="mt-6"><LoadingCards count={3} height="h-24" /></div>;
  if (status === 'offline') {
    return (
      <div className="mt-6">
        <OfflineState service="SEO" action={<button onClick={load} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[var(--pl-text-muted)]">{locations.length} location{locations.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => { setEditTarget(null); setShowForm(true); }}
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-[#02120f]"
          style={{ background: ACCENT }}
        >
          <Plus size={14} /> Add Location
        </button>
      </div>

      {showForm && (
        <LocationForm
          initial={formInitial}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditTarget(null); }}
          saving={saving}
        />
      )}

      {locations.length === 0 && !showForm ? (
        <EmptyState
          title="No locations yet"
          body="Add your first business location to start tracking reviews, citations, and local rankings."
          action={
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-[#02120f]"
              style={{ background: ACCENT }}
            >
              <MapPin size={14} /> Add Location
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {locations.map((loc) => (
            <LocationCard key={loc.id} loc={loc} onEdit={openEdit} onArchive={handleArchive} />
          ))}
        </div>
      )}
    </div>
  );
}
