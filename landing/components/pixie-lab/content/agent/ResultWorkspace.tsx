'use client';

import { useState } from 'react';
import { Copy, Check, Save, RefreshCw, Pencil, Star, ArrowLeft } from 'lucide-react';
import type { ContentType, GeneratedVariation, GenerationResult } from '@/lib/pixie-lab/contentAgentTypes';
import { StructuredView } from './StructuredView';
import { ErrorNote, GhostButton, ModeBadge, PrimaryButton, copyText, inputClass } from './ui';

/**
 * ResultWorkspace — the post-generation editor. Shows every variation (tabs),
 * supports copy / inline text edit / mark-preferred, then Save the chosen
 * variation as a new document or Regenerate. Structured payloads (carousel / ad /
 * SEO) are rendered field-by-field and preserved on save — never flattened away.
 */
export function ResultWorkspace({
  contentType,
  result,
  busy,
  serverError,
  onSave,
  onRegenerate,
  onBackToForm,
}: {
  contentType: ContentType;
  result: GenerationResult;
  busy: boolean;
  serverError?: string;
  onSave: (variation: GeneratedVariation, title: string) => void;
  onRegenerate: () => void;
  onBackToForm: () => void;
}) {
  const [active, setActive] = useState(0);
  const [preferred, setPreferred] = useState(0);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [title, setTitle] = useState('');

  const variations = result.variations || [];
  if (variations.length === 0) return <ErrorNote>No content was returned. Try regenerating.</ErrorNote>;

  const current = variations[active];
  const text = edits[active] ?? current.text;
  const isStructured = current.structured && Object.keys(current.structured).length > 0;

  function chosenVariation(): GeneratedVariation {
    // Save the PREFERRED variation, carrying any inline text edit + its structured payload.
    const base = variations[preferred];
    return { ...base, text: edits[preferred] ?? base.text };
  }

  async function doCopy() {
    const ok = await copyText(text);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1500); }
  }

  return (
    <div>
      <button onClick={onBackToForm} className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)]">
        <ArrowLeft size={14} /> Back to form
      </button>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="font-display text-[1.1rem] font-extrabold tracking-tight text-[var(--pl-text)]">Generated content</h2>
        <ModeBadge mock={result.usage.mock} />
        <span className="text-[11.5px] text-[var(--pl-text-muted)]">{result.usage.provider}{result.usage.model ? ` · ${result.usage.model}` : ''}</span>
      </div>

      {/* Variation tabs */}
      {variations.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Variations">
          {variations.map((v, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === active}
              onClick={() => { setActive(i); setEditing(false); }}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition"
              style={i === active
                ? { borderColor: 'var(--pl-green)', color: 'var(--pl-green)', background: 'color-mix(in srgb, var(--pl-green) 10%, transparent)' }
                : { borderColor: 'var(--pl-border)', color: 'var(--pl-text-muted)' }}
            >
              {preferred === i && <Star size={12} fill="currentColor" />}
              Variation {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* Active variation */}
      <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="flex-1 truncate font-display text-[14px] font-bold text-[var(--pl-text)]" title={current.title}>{current.title || 'Untitled'}</p>
          <button onClick={() => setPreferred(active)} className="inline-flex items-center gap-1 rounded-md border border-[var(--pl-border)] px-2 py-1 text-[11.5px] font-semibold text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)]" aria-pressed={preferred === active}>
            <Star size={12} fill={preferred === active ? 'currentColor' : 'none'} /> {preferred === active ? 'Preferred' : 'Mark preferred'}
          </button>
          <button onClick={doCopy} className="inline-flex items-center gap-1 rounded-md border border-[var(--pl-border)] px-2 py-1 text-[11.5px] font-semibold text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)]" aria-label="Copy text">
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
          </button>
          <button onClick={() => setEditing((e) => !e)} className="inline-flex items-center gap-1 rounded-md border border-[var(--pl-border)] px-2 py-1 text-[11.5px] font-semibold text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)]" aria-pressed={editing}>
            <Pencil size={12} /> {editing ? 'Done' : 'Edit'}
          </button>
        </div>

        {isStructured && !editing && <StructuredView contentType={contentType} data={current.structured} />}

        {(editing || !isStructured) && (
          <textarea
            aria-label="Generated text"
            className={`${inputClass} min-h-[220px] resize-y font-mono text-[12.5px] leading-relaxed`}
            value={text}
            readOnly={!editing}
            onChange={(e) => setEdits((prev) => ({ ...prev, [active]: e.target.value }))}
          />
        )}
        {isStructured && (
          <p className="mt-2 text-[11px] text-[var(--pl-text-muted)]">Structured payload is preserved on save. Editing changes only the text rendering.</p>
        )}
      </div>

      {serverError && <div className="mt-3"><ErrorNote>{serverError}</ErrorNote></div>}

      {/* Save row */}
      <div className="mt-4 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
        <label htmlFor="ca-save-title" className="mb-1.5 block text-[12.5px] font-semibold text-[var(--pl-text-muted)]">Document title <span className="font-normal opacity-60">(optional)</span></label>
        <input id="ca-save-title" className={inputClass} placeholder={variations[preferred]?.title || 'Untitled'} value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <PrimaryButton busy={busy} disabled={busy} onClick={() => onSave(chosenVariation(), title.trim())}>
            <Save size={15} /> Save {variations.length > 1 ? `variation ${preferred + 1}` : 'to library'}
          </PrimaryButton>
          <GhostButton disabled={busy} onClick={onRegenerate}>
            <RefreshCw size={14} /> Regenerate
          </GhostButton>
        </div>
      </div>
    </div>
  );
}
