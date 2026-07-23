'use client';

import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Sparkles, Save, RotateCcw } from 'lucide-react';
import type { ContentTypeSpec, FieldSpec, GenerationInputs, GenerationOptions } from '@/lib/pixie-lab/contentAgentTypes';
import { FieldInput, emptyValue, type FormValues, type FieldValue } from './fields';
import { ErrorNote, GhostButton, PrimaryButton } from './ui';
import { useCreditEstimate } from '@/lib/pixie-lab/useCreditEstimate';
import { CreditEstimateBadge } from '@/components/pixie-lab/billing/CreditEstimateBadge';

export interface GeneratePayload {
  inputs: GenerationInputs;
  options: GenerationOptions;
}

/** Build the generation payload. `inputs` holds the content fields; `options`
 *  holds the FULL flat value map (fields + controls). Options is a superset
 *  because some fields (notably `platform`) belong to the backend's
 *  GenerationOptions model — each Pydantic model ignores keys it does not own, so
 *  a superset is safe and makes the stored request snapshot reconstruct exactly
 *  on regenerate (no lost platform/tone). */
function partition(spec: ContentTypeSpec, values: FormValues): GeneratePayload {
  const controlNames = new Set(spec.controls.map((c) => c.name));
  const inputs: GenerationInputs = {};
  const options: Record<string, FieldValue> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === '' || (Array.isArray(v) && v.length === 0)) continue;
    options[k] = v; // options is the full flat map (backend ignores unowned keys)
    if (!controlNames.has(k)) inputs[k] = v;
  }
  return { inputs, options: options as GenerationOptions };
}

function seed(specs: FieldSpec[]): FormValues {
  const out: FormValues = {};
  for (const f of specs) out[f.name] = emptyValue(f.kind);
  return out;
}

/**
 * GenerationForm — a type-specific form built from a ContentTypeSpec. Renders the
 * content fields and the cross-cutting controls, validates required fields
 * inline, and exposes Generate (preview) + Generate & save. Warns before
 * discarding unsaved input when the user goes back.
 */
export function GenerationForm({
  spec,
  busy,
  serverError,
  onBack,
  onGenerate,
  isMock = true,
}: {
  spec: ContentTypeSpec;
  busy: boolean;
  serverError?: string;
  onBack: () => void;
  onGenerate: (payload: GeneratePayload, save: boolean) => void;
  /** Whether the generation runs in mock mode. Defaults to true (safe — no charge). */
  isMock?: boolean;
}) {
  const allSpecs = useMemo(() => [...spec.fields, ...spec.controls], [spec]);
  const [values, setValues] = useState<FormValues>(() => {
    const base = seed(allSpecs);
    // sensible defaults for controls
    if ('variations' in base) base.variations = 1;
    if ('length' in base) base.length = 'medium';
    if ('language' in base) base.language = 'en';
    if ('include_emojis' in base) base.include_emojis = true;
    if ('include_hashtags' in base) base.include_hashtags = true;
    return base;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = useRef(false);

  // Derive variations for the estimate (number field, may be absent)
  const variationsValue = typeof values.variations === 'number' && values.variations > 0
    ? values.variations
    : 1;

  // Non-blocking credit estimate — only renders when credit system is enabled.
  const { show: showEstimate, estimate } = useCreditEstimate({
    operation: 'content_text',
    variations: variationsValue,
    is_mock: isMock,
    byok: false,
  });

  function set(name: string, v: FieldValue) {
    dirty.current = true;
    setValues((prev) => ({ ...prev, [name]: v }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: '' }));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    for (const f of allSpecs) {
      if (!f.required) continue;
      const v = values[f.name];
      const empty = v === '' || v === undefined || v === null || (Array.isArray(v) && v.length === 0);
      if (empty) next[f.name] = `${f.label} is required.`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function submit(save: boolean) {
    if (!validate()) return;
    onGenerate(partition(spec, values), save);
  }

  function reset() {
    setValues(() => {
      const base = seed(allSpecs);
      if ('variations' in base) base.variations = 1;
      if ('length' in base) base.length = 'medium';
      if ('language' in base) base.language = 'en';
      return base;
    });
    setErrors({});
    dirty.current = false;
  }

  function back() {
    if (dirty.current && !window.confirm('Discard your inputs and go back?')) return;
    onBack();
  }

  return (
    <div>
      <button onClick={back} className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)]">
        <ArrowLeft size={14} /> All content types
      </button>

      <h2 className="font-display text-[1.15rem] font-extrabold tracking-tight text-[var(--pl-text)]">{spec.label}</h2>
      <p className="mt-1 text-[13px] text-[var(--pl-text-muted)]">{spec.description}</p>

      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => { e.preventDefault(); submit(false); }}
      >
        {spec.fields.map((f) => (
          <FieldInput key={f.name} spec={f} value={values[f.name]} error={errors[f.name]} onChange={(v) => set(f.name, v)} />
        ))}

        {spec.controls.length > 0 && (
          <fieldset className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
            <legend className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pl-text-muted)]">Output controls</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {spec.controls.map((c) => (
                <FieldInput key={c.name} spec={c} value={values[c.name]} error={errors[c.name]} onChange={(v) => set(c.name, v)} />
              ))}
            </div>
          </fieldset>
        )}

        {serverError && <ErrorNote>{serverError}</ErrorNote>}

        {/* Credit estimate badge — only renders when credit system is enabled */}
        {showEstimate && estimate && (
          <CreditEstimateBadge estimate={estimate} />
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <PrimaryButton type="submit" busy={busy} disabled={busy}>
            <Sparkles size={15} /> Generate
          </PrimaryButton>
          <GhostButton type="button" onClick={() => submit(true)} disabled={busy}>
            <Save size={14} /> Generate &amp; save
          </GhostButton>
          <GhostButton type="button" onClick={reset} disabled={busy}>
            <RotateCcw size={14} /> Reset
          </GhostButton>
        </div>
      </form>
    </div>
  );
}
