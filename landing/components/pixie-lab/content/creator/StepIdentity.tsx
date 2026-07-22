'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createIdentityFromCharacteristics,
  uploadIdentityReference,
  invalidateFrom,
  type CreatorError,
} from '@/lib/pixie-lab/contentCreatorClient';
import { StepCard, TextField, PrimaryButton, GhostButton, ErrorNote, DoneRow, Badge } from './ui';
import { staleGatesFor, type StepProps } from './stepProps';

/**
 * Stage 2 — Influencer identity. Two methods, end-to-end:
 *  1. Upload a reference image → hosted via the authenticated content-asset
 *     service (never uploaded to the provider from the browser) → stored on the
 *     identity for image-conditioned generation / character consistency.
 *  2. Describe characteristics (mock-safe, no upload).
 * The saved reference is recovered after refresh / restart from wizard state.
 */

const ACCEPT = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

function fmtSize(b: number): string {
  return b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function StepIdentity({ state, advance, reload }: StepProps) {
  const id = state.identity;
  const editing = Boolean(id);
  const savedRef = id?.source === 'reference_image' ? id?.reference_ref || '' : '';
  const savedIsUrl = /^https?:\/\//.test(savedRef);

  const [method, setMethod] = useState<'upload' | 'describe'>(id?.source === 'reference_image' ? 'upload' : 'describe');
  const stale = staleGatesFor(state, 'influencer_setup');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<CreatorError | null>(null);

  return (
    <StepCard
      title="Influencer setup"
      description="Create one AI influencer identity. It is reused across every generated video for consistency."
    >
      {editing ? <div className="mb-3"><DoneRow label={`Identity locked (${id?.source})`} /></div> : null}

      {/* Method switch */}
      <div className="mb-4 flex gap-2" role="tablist" aria-label="Identity method">
        <MethodTab active={method === 'upload'} onClick={() => setMethod('upload')}>Upload reference image</MethodTab>
        <MethodTab active={method === 'describe'} onClick={() => setMethod('describe')}>Describe characteristics</MethodTab>
      </div>

      {method === 'upload' ? (
        <UploadMethod
          state={state} advance={advance} reload={reload}
          editing={editing} savedRef={savedIsUrl ? savedRef : ''} stale={stale}
          busy={busy} setBusy={setBusy} err={err} setErr={setErr}
        />
      ) : (
        <DescribeMethod
          state={state} advance={advance} reload={reload}
          editing={editing} stale={stale}
          busy={busy} setBusy={setBusy} err={err} setErr={setErr}
        />
      )}
    </StepCard>
  );
}

function MethodTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition"
      style={active
        ? { borderColor: 'var(--pl-green)', color: 'var(--pl-green)', background: 'color-mix(in srgb, var(--pl-green) 10%, transparent)' }
        : { borderColor: 'var(--pl-border)', color: 'var(--pl-text-muted)' }}
    >
      {children}
    </button>
  );
}

type MethodProps = Pick<StepProps, 'state' | 'advance' | 'reload'> & {
  editing: boolean;
  stale: string[];
  busy: boolean;
  setBusy: (b: boolean) => void;
  err: CreatorError | null;
  setErr: (e: CreatorError | null) => void;
};

function UploadMethod({ advance, reload, editing, savedRef, stale, busy, setBusy, err, setErr }: MethodProps & { savedRef: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function choose(f: File | undefined) {
    if (!f) return;
    if (!ACCEPT.includes(f.type)) { setErr({ kind: 'validation', status: 422, message: 'Use a PNG, JPEG or WEBP image.' }); return; }
    if (f.size === 0) { setErr({ kind: 'validation', status: 422, message: 'That file is empty.' }); return; }
    if (f.size > MAX_BYTES) { setErr({ kind: 'validation', status: 422, message: `Image is too large (${fmtSize(f.size)}). Max ${fmtSize(MAX_BYTES)}.` }); return; }
    if (preview) URL.revokeObjectURL(preview);
    setErr(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  function remove() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null); setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function upload() {
    if (!file) { setErr({ kind: 'validation', status: 422, message: 'Choose a reference image first.' }); return; }
    if (stale.length && !window.confirm(`Changing the influencer identity resets ${stale.length} approval(s) and later work. Continue?`)) return;
    setBusy(true); setErr(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = String(reader.result).split(',')[1] || '';
      if (stale.length) await invalidateFrom('influencer_setup');
      const res = await uploadIdentityReference({ image_base64: base64, content_type: file.type, filename: file.name });
      setBusy(false);
      if (!res.ok) { setErr(res.error); return; }
      await (editing ? reload() : advance());
    };
    reader.onerror = () => { setBusy(false); setErr({ kind: 'validation', status: 422, message: 'Could not read that file.' }); };
    reader.readAsDataURL(file);
  }

  const showSaved = savedRef && !preview;

  return (
    <div>
      <div className="mb-3"><Badge tone="info">Character consistency: a reference image lets a compatible video model keep the same face across every clip. Without it, videos are described-only.</Badge></div>

      {/* Preview / saved / dropzone */}
      {(preview || showSaved) ? (
        <div className="mb-3 flex items-start gap-3 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview || savedRef} alt="Reference preview" className="h-24 w-24 rounded-lg object-cover" />
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[var(--pl-text)]">{preview ? file?.name : 'Saved reference image'}</p>
            {file ? <p className="text-[12px] text-[var(--pl-text-muted)]">{fmtSize(file.size)}</p> : null}
            <div className="mt-2 flex gap-2">
              <GhostButton onClick={() => fileRef.current?.click()}>{preview ? 'Replace' : 'Replace image'}</GhostButton>
              {preview ? <GhostButton onClick={remove}>Remove</GhostButton> : null}
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          className="mb-3 flex min-h-[120px] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[var(--pl-border)] bg-[var(--pl-surface)] p-5 text-center transition hover:border-[var(--pl-border-strong)]"
        >
          <span className="text-[14px] font-semibold text-[var(--pl-text)]">Click to choose a reference image</span>
          <span className="text-[12px] text-[var(--pl-text-muted)]">PNG, JPEG or WEBP · up to {fmtSize(MAX_BYTES)}</span>
        </button>
      )}

      <input ref={fileRef} type="file" accept={ACCEPT.join(',')} className="sr-only" aria-label="Reference image file" onChange={(e) => choose(e.target.files?.[0])} />

      <p className="mb-3 text-[12px] text-[var(--pl-text-muted)]">
        Privacy: your image is stored in your workspace's private asset storage and used only to generate your content. It is never uploaded to the AI provider from your browser.
      </p>

      <ErrorNote error={err} />
      <div className="mt-2"><PrimaryButton busy={busy} onClick={upload}>{editing ? 'Save reference image' : 'Lock identity and continue'}</PrimaryButton></div>
      {stale.length ? <p className="mt-3 text-xs text-amber-500">Editing resets: {stale.join(', ')}.</p> : null}
    </div>
  );
}

function DescribeMethod({ state, advance, reload, editing, stale, busy, setBusy, err, setErr }: MethodProps) {
  const c = (state.identity?.characteristics || {}) as Record<string, string>;
  const [look, setLook] = useState(c.look || '');
  const [vibe, setVibe] = useState(c.vibe || '');
  const [outfit, setOutfit] = useState(c.outfit || '');
  const [persona, setPersona] = useState(c.content_persona || '');

  async function save() {
    if (!look.trim() && !vibe.trim()) { setErr({ kind: 'validation', status: 422, message: 'Describe at least the look or vibe.' }); return; }
    if (stale.length && !window.confirm(`Changing the influencer identity resets ${stale.length} approval(s) and later work. Continue?`)) return;
    setBusy(true); setErr(null);
    if (stale.length) await invalidateFrom('influencer_setup');
    const res = await createIdentityFromCharacteristics({ look, vibe, outfit, content_persona: persona });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    await (editing ? reload() : advance());
  }

  return (
    <div>
      <div className="mb-4"><Badge tone="warn">Described identities have no reference image, so a video model cannot guarantee a consistent face. Upload an image for character consistency.</Badge></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="id-look" label="Look" value={look} onChange={setLook} placeholder="athletic, 20s, natural" />
        <TextField id="id-vibe" label="Vibe" value={vibe} onChange={setVibe} placeholder="warm, energetic" />
        <TextField id="id-outfit" label="Outfit" value={outfit} onChange={setOutfit} placeholder="activewear" />
        <TextField id="id-persona" label="Content persona" value={persona} onChange={setPersona} placeholder="approachable coach" />
      </div>
      {stale.length ? <p className="mt-3 text-xs text-amber-500">Editing resets: {stale.join(', ')}.</p> : null}
      <ErrorNote error={err} />
      <div className="mt-3"><PrimaryButton busy={busy} onClick={save}>{editing ? 'Save identity' : 'Lock identity and continue'}</PrimaryButton></div>
    </div>
  );
}
