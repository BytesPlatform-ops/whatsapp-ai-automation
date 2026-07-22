'use client';

import { useMemo, useState } from 'react';
import {
  Megaphone, Quote, FileText, Mail, BadgeDollarSign, Package, Search,
  Clapperboard, LayoutGrid, Repeat, Sparkles, type LucideIcon,
} from 'lucide-react';
import type { ContentType, ContentTypeSpec } from '@/lib/pixie-lab/contentAgentTypes';
import { ACCENT, inputClass } from './ui';

/** Map the backend `icon` string to a lucide icon (falls back to Sparkles). */
const ICONS: Record<string, LucideIcon> = {
  megaphone: Megaphone,
  quote: Quote,
  'file-text': FileText,
  mail: Mail,
  'badge-dollar-sign': BadgeDollarSign,
  package: Package,
  search: Search,
  clapperboard: Clapperboard,
  'layout-grid': LayoutGrid,
  repeat: Repeat,
};

/**
 * TypeSelector — a grid of content-type cards. Keyboard accessible (each card is
 * a real button), searchable, and shows whether a type produces structured
 * output. Selecting a card opens its real generation form.
 */
export function TypeSelector({
  types,
  onSelect,
  recent = [],
}: {
  types: ContentTypeSpec[];
  onSelect: (t: ContentType) => void;
  recent?: ContentType[];
}) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return types;
    return types.filter(
      (t) =>
        t.label.toLowerCase().includes(needle) ||
        t.description.toLowerCase().includes(needle) ||
        t.content_type.includes(needle),
    );
  }, [types, q]);

  const recentSpecs = useMemo(
    () => recent.map((ct) => types.find((t) => t.content_type === ct)).filter(Boolean) as ContentTypeSpec[],
    [recent, types],
  );

  return (
    <div>
      <label className="sr-only" htmlFor="ca-type-search">Search content types</label>
      <div className="relative mb-5 max-w-sm">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pl-text-muted)]" />
        <input
          id="ca-type-search"
          className={`${inputClass} pl-9`}
          placeholder="Search content types…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {recentSpecs.length > 0 && !q && (
        <section className="mb-6" aria-label="Recently used">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pl-text-muted)]">Recently used</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentSpecs.map((t) => <Card key={`r-${t.content_type}`} spec={t} onSelect={onSelect} />)}
          </div>
        </section>
      )}

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-[var(--pl-text-muted)]">No content types match “{q}”.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="list">
          {filtered.map((t) => <Card key={t.content_type} spec={t} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  );
}

function Card({ spec, onSelect }: { spec: ContentTypeSpec; onSelect: (t: ContentType) => void }) {
  const Icon = ICONS[spec.icon] || Sparkles;
  return (
    <button
      type="button"
      role="listitem"
      onClick={() => onSelect(spec.content_type)}
      className="group flex h-full flex-col rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4 text-left transition hover:border-[var(--pl-border-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-green)]"
    >
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `${ACCENT}1a`, color: ACCENT }}>
          <Icon size={17} />
        </span>
        <span className="font-display text-[14.5px] font-bold text-[var(--pl-text)]">{spec.label}</span>
        {spec.structured && (
          <span className="ml-auto rounded-full border border-[var(--pl-border)] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[var(--pl-text-muted)]" title="Produces structured, field-by-field output">
            Structured
          </span>
        )}
      </div>
      <p className="mt-2 text-[12.5px] leading-snug text-[var(--pl-text-soft)]">{spec.description}</p>
      <p className="mt-auto pt-2.5 text-[11.5px] italic text-[var(--pl-text-muted)]">e.g. {spec.example}</p>
    </button>
  );
}
