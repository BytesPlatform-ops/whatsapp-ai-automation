'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { contentRoutes } from '@/lib/pixie-lab/contentRoutes';
import { CheckCircle2, PenLine } from 'lucide-react';
import type {
  ContentType, ContentTypeSpec, GenerateResponse, GeneratedVariation, StatusResponse,
} from '@/lib/pixie-lab/contentAgentTypes';
import { generateContent, getAgentStatus, getContentTypes, saveGenerated } from '@/lib/pixie-lab/contentAgentClient';
import { TypeSelector } from './TypeSelector';
import { GenerationForm, type GeneratePayload } from './GenerationForm';
import { ResultWorkspace } from './ResultWorkspace';
import { DocumentEditor } from './DocumentEditor';
import { EmptyState, ErrorNote, GhostButton, ModeBadge, PrimaryButton, Spinner } from './ui';
import { type BillingErrorCode } from '@/lib/pixie-lab/billingClient';
import { InsufficientCreditsNotice } from '@/components/pixie-lab/billing/InsufficientCreditsNotice';

const BILLING_CODES = new Set<string>([
  'insufficient_credits',
  'feature_not_entitled',
  'usage_limit_reached',
  'plan_inactive',
  'billing_past_due',
  'payment_required',
]);

const RECENT_KEY = 'ca_recent_types';

function readRecent(): ContentType[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}
function pushRecent(ct: ContentType) {
  try {
    const next = [ct, ...readRecent().filter((x) => x !== ct)].slice(0, 3);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

type View = 'selector' | 'form' | 'result' | 'saved' | 'editor';

/** Structured billing error state — separate from the generic string error so
 *  existing error handling is never modified. */
interface BillingErrorState {
  code: BillingErrorCode;
  detail?: {
    limit_key?: string;
    limit?: number;
    used?: number;
    available_mc?: number;
    required_mc?: number;
  };
}

/**
 * ContentAgentWorkspace — the "create written content" flow: choose a type →
 * fill its form → preview variations → edit/save. Generate & save jumps straight
 * into the document editor. Fetches the type registry + generation mode once.
 */
export function ContentAgentWorkspace() {
  const [types, setTypes] = useState<ContentTypeSpec[] | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loadError, setLoadError] = useState('');
  const [recent, setRecent] = useState<ContentType[]>([]);

  const [view, setView] = useState<View>('selector');
  const [selected, setSelected] = useState<ContentTypeSpec | null>(null);
  const [payload, setPayload] = useState<GeneratePayload | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedDocId, setSavedDocId] = useState('');
  /** Structured billing error — only set when the backend returns a billing gate
   *  error code. Null otherwise (default path). */
  const [billingError, setBillingError] = useState<BillingErrorState | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([getContentTypes(), getAgentStatus()]).then(([t, s]) => {
      if (!alive) return;
      if (!t.ok) { setLoadError(t.error.message); return; }
      setTypes(t.data.content_types);
      if (s.ok) setStatus(s.data);
    });
    setRecent(readRecent());
    return () => { alive = false; };
  }, []);

  const selectType = useCallback((ct: ContentType) => {
    const spec = types?.find((t) => t.content_type === ct) || null;
    setSelected(spec);
    setError('');
    setBillingError(null);
    setResult(null);
    setView('form');
  }, [types]);

  async function generate(p: GeneratePayload, save: boolean) {
    if (!selected) return;
    setBusy(true); setError(''); setBillingError(null);
    setPayload(p);
    const r = await generateContent({ contentType: selected.content_type, inputs: p.inputs, options: p.options, save });
    setBusy(false);
    if (!r.ok) {
      // Check whether the backend returned a structured billing error code.
      // The detail object may carry { error: 'insufficient_credits', ... } from
      // the billing proxy. Existing message-based error handling is preserved.
      const detail = r.error.detail as Record<string, unknown> | undefined;
      const maybeCode = typeof detail?.error === 'string' ? detail.error : undefined;
      if (maybeCode && BILLING_CODES.has(maybeCode)) {
        setBillingError({
          code: maybeCode as BillingErrorCode,
          detail: {
            available_mc: typeof detail?.available_mc === 'number' ? detail.available_mc : undefined,
            required_mc: typeof detail?.required_mc === 'number' ? detail.required_mc : undefined,
            limit_key: typeof detail?.limit_key === 'string' ? detail.limit_key : undefined,
            limit: typeof detail?.limit === 'number' ? detail.limit : undefined,
            used: typeof detail?.used === 'number' ? detail.used : undefined,
          },
        });
      }
      // Always set the string error too — existing error handling is unchanged.
      setError(r.error.message);
      return;
    }
    if (save && r.data.saved) {
      pushRecent(selected.content_type);
      setRecent(readRecent());
      setSavedDocId(r.data.id);
      setView('editor');
      return;
    }
    setResult(r.data);
    setView('result');
  }

  async function saveVariation(variation: GeneratedVariation, title: string) {
    if (!selected) return;
    setBusy(true); setError('');
    const r = await saveGenerated({
      contentType: selected.content_type,
      variation,
      title,
      settings: payload ? { content_type: selected.content_type, inputs: payload.inputs, options: payload.options } : {},
      provider: result && 'result' in result ? result.result.usage.provider : 'mock',
      model: result && 'result' in result ? result.result.usage.model : 'mock',
      mock: result && 'result' in result ? result.result.usage.mock : true,
      promptVersion: result && 'result' in result ? result.result.usage.prompt_version : '',
    });
    setBusy(false);
    if (!r.ok) { setError(r.error.message); return; }
    pushRecent(selected.content_type);
    setRecent(readRecent());
    setSavedDocId(r.data.id);
    setView('saved');
  }

  function regenerate() {
    if (payload) generate(payload, false);
  }

  function reset() {
    setSelected(null); setResult(null); setPayload(null);
    setError(''); setBillingError(null); setSavedDocId('');
    setView('selector');
  }

  // ── render ──
  if (loadError) return <ErrorNote>{loadError}</ErrorNote>;
  if (!types) return <Spinner label="Loading content types…" />;

  return (
    <div>
      {status && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px] text-[var(--pl-text-muted)]">
          <ModeBadge mock={status.mock} />
          {status.mock ? (
            <span>Local mock mode — no paid API calls.</span>
          ) : status.available ? (
            <span>Live provider: {status.provider}{status.model ? ` · ${status.model}` : ''}.</span>
          ) : (
            <span className="text-amber-500">
              Provider not configured{status.missing.length ? ` — set ${status.missing.join(', ')}` : ''}. Generation will fail until configured.
            </span>
          )}
        </div>
      )}

      {view === 'selector' && (
        <TypeSelector types={types} recent={recent} onSelect={selectType} />
      )}

      {view === 'form' && selected && (
        <>
          <GenerationForm spec={selected} busy={busy} serverError={error} onBack={reset} onGenerate={generate} isMock={status?.mock ?? true} />
          {/* Billing gate error — only renders when the backend returns a billing
              error code. Additive; existing serverError display inside the form
              is preserved. */}
          {billingError && (
            <div className="mt-4">
              <InsufficientCreditsNotice code={billingError.code} detail={billingError.detail} planId="" />
            </div>
          )}
        </>
      )}

      {view === 'result' && result && 'result' in result && selected && (
        <ResultWorkspace
          contentType={selected.content_type}
          result={result.result}
          busy={busy}
          serverError={error}
          onSave={saveVariation}
          onRegenerate={regenerate}
          onBackToForm={() => setView('form')}
        />
      )}

      {view === 'saved' && (
        <SavedConfirmation onOpen={() => setView('editor')} onNew={reset} />
      )}

      {view === 'editor' && savedDocId && (
        <DocumentEditor docId={savedDocId} onClose={reset} />
      )}
    </div>
  );
}

function SavedConfirmation({ onOpen, onNew }: { onOpen: () => void; onNew: () => void }) {
  return (
    <EmptyState
      title="Saved to your library"
      body="Your content is saved as a draft. Open it to edit, regenerate or manage versions, or start a new piece."
      action={
        <div className="flex flex-wrap justify-center gap-3">
          <PrimaryButton onClick={onOpen}><PenLine size={15} /> Open document</PrimaryButton>
          <Link href={contentRoutes.generated()}><GhostButton><CheckCircle2 size={14} /> Go to library</GhostButton></Link>
          <GhostButton onClick={onNew}>Create another</GhostButton>
        </div>
      }
    />
  );
}
