'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { COUNTRIES, DEFAULT_COUNTRY, flagOf, type Country } from './countries';

interface PhoneFieldProps {
  /** Fired with the full contact string, e.g. "+1 5551234567" (empty if no number). */
  onChange: (value: string) => void;
}

/**
 * Contact-number field with a searchable country-code selector. The visitor
 * picks a country (search by name or dial code), then types the local number;
 * the parent receives the combined `"<dial> <number>"` string. Styled via
 * joinPixie.css (jp-phone* classes).
 */
export function PhoneField({ onChange }: PhoneFieldProps) {
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [number, setNumber] = useState('');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  function emit(c: Country, n: string) {
    const digits = n.trim();
    onChange(digits ? `${c.dial} ${digits}` : '');
  }

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    const dq = q.replace(/^\+/, '');
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dial.replace('+', '').startsWith(dq) ||
        c.iso.toLowerCase() === q,
    );
  }, [query]);

  // Close on outside click / Escape; focus the search box when opening.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => searchRef.current?.focus(), 30);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open]);

  function pick(c: Country) {
    setCountry(c);
    setOpen(false);
    setQuery('');
    emit(c, number);
  }

  return (
    <div ref={rootRef} className="jp-phone">
      <div className="jp-phone__row">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="jp-phone__country"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Country code: ${country.name} ${country.dial}`}
        >
          <span className="jp-phone__flag" aria-hidden>
            {flagOf(country.iso)}
          </span>
          <span className="jp-phone__dial">{country.dial}</span>
          <ChevronDown className="jp-phone__chev" strokeWidth={2.5} />
        </button>

        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={number}
          onChange={(e) => {
            const n = e.target.value.replace(/[^\d\s-]/g, '');
            setNumber(n);
            emit(country, n);
          }}
          placeholder="Phone number"
          aria-label="Phone number"
          className="jp-phone__number"
        />
      </div>

      {open && (
        <div className="jp-phone__menu" role="listbox">
          <div className="jp-phone__search">
            <Search className="jp-phone__search-icon" strokeWidth={2.4} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country or code…"
              aria-label="Search country"
              className="jp-phone__search-input"
            />
          </div>
          <ul className="jp-phone__list">
            {results.length === 0 ? (
              <li className="jp-phone__empty">No matches</li>
            ) : (
              results.map((c) => {
                const active = c.iso === country.iso;
                return (
                  <li key={c.iso}>
                    <button
                      type="button"
                      onClick={() => pick(c)}
                      className={`jp-phone__opt${active ? ' jp-phone__opt--active' : ''}`}
                      role="option"
                      aria-selected={active}
                    >
                      <span className="jp-phone__flag" aria-hidden>
                        {flagOf(c.iso)}
                      </span>
                      <span className="jp-phone__opt-name">{c.name}</span>
                      <span className="jp-phone__opt-dial">{c.dial}</span>
                      {active && <Check className="jp-phone__opt-check" strokeWidth={2.6} />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
