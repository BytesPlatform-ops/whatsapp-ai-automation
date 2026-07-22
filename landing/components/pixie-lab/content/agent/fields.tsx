'use client';

import { useState } from 'react';
import type { FieldSpec } from '@/lib/pixie-lab/contentAgentTypes';
import { inputClass } from './ui';

export type FieldValue = string | number | boolean | string[];
export type FormValues = Record<string, FieldValue>;

/** Sensible empty value for a field kind (used to seed + reset the form). */
export function emptyValue(kind: FieldSpec['kind']): FieldValue {
  if (kind === 'toggle') return false;
  if (kind === 'number') return 0;
  if (kind === 'tags' || kind === 'multiselect') return [];
  return '';
}

function labelId(name: string) {
  return `ca-field-${name}`;
}

/**
 * FieldInput — renders one FieldSpec. Fully labelled + a11y wired: the control's
 * id matches its <label htmlFor>, errors are announced via aria-describedby.
 */
export function FieldInput({
  spec,
  value,
  error,
  onChange,
}: {
  spec: FieldSpec;
  value: FieldValue;
  error?: string;
  onChange: (v: FieldValue) => void;
}) {
  const id = labelId(spec.name);
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [spec.hint ? `${id}-hint` : '', errId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={spec.kind === 'toggle' ? 'flex items-start gap-3' : ''}>
      {spec.kind !== 'toggle' && (
        <label htmlFor={id} className="mb-1.5 block text-[12.5px] font-semibold text-[var(--pl-text-muted)]">
          {spec.label} {spec.required ? <span className="text-amber-500" aria-hidden>*</span> : <span className="font-normal opacity-60">(optional)</span>}
        </label>
      )}

      {renderControl(spec, id, value, onChange, describedBy, Boolean(error))}

      {spec.kind === 'toggle' && (
        <label htmlFor={id} className="text-[12.5px] font-semibold text-[var(--pl-text-muted)]">
          {spec.label}
        </label>
      )}

      {spec.hint && (
        <p id={`${id}-hint`} className="mt-1 text-[11.5px] text-[var(--pl-text-muted)]">{spec.hint}</p>
      )}
      {error && (
        <p id={errId} className="mt-1 text-[11.5px] text-amber-500">{error}</p>
      )}
    </div>
  );
}

function renderControl(
  spec: FieldSpec,
  id: string,
  value: FieldValue,
  onChange: (v: FieldValue) => void,
  describedBy: string | undefined,
  invalid: boolean,
) {
  const aria = { 'aria-describedby': describedBy, 'aria-invalid': invalid || undefined };

  switch (spec.kind) {
    case 'textarea':
      return (
        <textarea
          id={id}
          rows={4}
          className={`${inputClass} resize-y`}
          placeholder={spec.placeholder}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          {...aria}
        />
      );
    case 'select':
      return (
        <select id={id} className={inputClass} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} {...aria}>
          <option value="">Select…</option>
          {(spec.options || []).map((o) => (
            <option key={o} value={o}>{prettify(o)}</option>
          ))}
        </select>
      );
    case 'multiselect':
      return <TokenPicker id={id} options={spec.options || []} value={asArray(value)} onChange={onChange} describedBy={describedBy} />;
    case 'number':
      return (
        <input
          id={id}
          type="number"
          className={inputClass}
          placeholder={spec.placeholder}
          value={value === '' || value === undefined ? '' : Number(value)}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          {...aria}
        />
      );
    case 'toggle':
      return (
        <input
          id={id}
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-[var(--pl-green)]"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          {...aria}
        />
      );
    case 'tags':
      return <TagInput id={id} value={asArray(value)} onChange={onChange} placeholder={spec.placeholder} describedBy={describedBy} />;
    case 'text':
    default:
      return (
        <input
          id={id}
          type="text"
          className={inputClass}
          placeholder={spec.placeholder}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          {...aria}
        />
      );
  }
}

function asArray(v: FieldValue): string[] {
  return Array.isArray(v) ? v : [];
}

function prettify(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Free-text tags — Enter or comma adds; each token removable. */
function TagInput({
  id, value, onChange, placeholder, describedBy,
}: { id: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; describedBy?: string }) {
  const [draft, setDraft] = useState('');
  function add(raw: string) {
    const t = raw.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft('');
  }
  return (
    <div className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-2 py-1.5">
      <div className="flex flex-wrap gap-1.5">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-md bg-[var(--pl-surface)] px-2 py-0.5 text-[12px] text-[var(--pl-text)]">
            {t}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remove ${t}`} className="text-[var(--pl-text-muted)] hover:text-[var(--pl-text)]">✕</button>
          </span>
        ))}
        <input
          id={id}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-[13px] text-[var(--pl-text)] outline-none"
          placeholder={value.length ? '' : (placeholder || 'Type and press Enter')}
          value={draft}
          aria-describedby={describedBy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); }
            else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => draft && add(draft)}
        />
      </div>
    </div>
  );
}

/** Multi-select from a fixed option list (toggle chips). */
function TokenPicker({
  id, options, value, onChange, describedBy,
}: { id: string; options: string[]; value: string[]; onChange: (v: string[]) => void; describedBy?: string }) {
  return (
    <div id={id} className="flex flex-wrap gap-1.5" role="group" aria-describedby={describedBy}>
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            className="rounded-full border px-2.5 py-1 text-[12px] font-semibold transition"
            style={on
              ? { borderColor: 'var(--pl-green)', color: 'var(--pl-green)', background: 'color-mix(in srgb, var(--pl-green) 10%, transparent)' }
              : { borderColor: 'var(--pl-border)', color: 'var(--pl-text-muted)' }}
          >
            {prettify(o)}
          </button>
        );
      })}
    </div>
  );
}
