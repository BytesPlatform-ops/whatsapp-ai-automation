'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Globe, Upload, Search, RefreshCw, Archive, Trash2 } from 'lucide-react';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';
import type { RcpKnowledgeSource, RcpRetrievalResult } from '@/lib/pixie-lab/serviceTypes';
import { OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { Card, Section, Field, TextInput, TextArea, PrimaryButton, GhostButton, Pill, RCP_ACCENT, fmtDate } from './widgets';

type Status = 'loading' | 'offline' | 'ready';

/** Honest index-status → label + colour (never claims "sent"/"live"). */
function sourceStatus(s?: string): { label: string; color: string } {
  switch (s) {
    case 'indexed': return { label: 'Indexed', color: '#16a34a' };
    case 'empty': return { label: 'No text found', color: '#f59e0b' };
    case 'failed': return { label: 'Failed', color: '#dc2626' };
    case 'archived': return { label: 'Archived', color: '#64748b' };
    case 'reindex_requires_reupload': return { label: 'Re-upload to reindex', color: '#f59e0b' };
    default: return { label: s || 'Queued', color: '#64748b' };
  }
}

export default function KnowledgeSourcesPanel() {
  const [status, setStatus] = useState<Status>('loading');
  const [sources, setSources] = useState<RcpKnowledgeSource[]>([]);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const r = await receptionistApi.getKnowledgeSources();
    if (!r.backendUp) { setStatus('offline'); return; }
    setSources(r.sources || []);
    setStatus('ready');
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (status === 'loading') return <LoadingCards />;
  if (status === 'offline') return <OfflineState service="AI Receptionist" />;

  return (
    <div className="space-y-6" data-testid="knowledge-sources-panel">
      {err && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      <IngestForms onDone={load} setBusy={setBusy} setErr={setErr} busy={busy} />
      <SourceList sources={sources} onChange={load} setErr={setErr} />
      <RetrievalTest />
    </div>
  );
}

function IngestForms({ onDone, setBusy, setErr, busy }: { onDone: () => void; setBusy: (s: string) => void; setErr: (s: string) => void; busy: string }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [crawl, setCrawl] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function addText() {
    if (!content.trim()) return;
    setBusy('text'); setErr('');
    const r = await receptionistApi.addTextSource(title, content);
    setBusy('');
    if (!r.backendUp || r.error) { setErr(r.error || 'Could not add text source.'); return; }
    setTitle(''); setContent(''); onDone();
  }

  async function addWebsite() {
    if (!url.trim()) return;
    setBusy('web'); setErr('');
    const r = await receptionistApi.addWebsiteSource(url, crawl);
    setBusy('');
    if (!r.backendUp || r.error) { setErr(r.error || 'That URL was rejected (only public web pages are allowed).'); return; }
    setUrl(''); onDone();
  }

  async function uploadPdf(file: File) {
    setBusy('pdf'); setErr('');
    const r = await receptionistApi.uploadPdfSource(file);
    setBusy('');
    if (!r.backendUp || r.error) { setErr(r.error || 'That file was rejected. Upload a valid, unencrypted PDF.'); return; }
    onDone();
  }

  return (
    <Section title="Add knowledge" sub="Text, PDF documents and public web pages. Nothing is sent to customers — this only grounds answers.">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium"><FileText size={16} color={RCP_ACCENT} /> Text</div>
          <Field label="Title"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Refund policy" /></Field>
          <Field label="Content"><TextArea rows={4} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Paste text the assistant can answer from." /></Field>
          <PrimaryButton onClick={addText} disabled={busy === 'text' || !content.trim()}>{busy === 'text' ? 'Adding…' : 'Add text'}</PrimaryButton>
        </Card>

        <Card>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Upload size={16} color={RCP_ACCENT} /> PDF</div>
          <p className="mb-3 text-xs text-slate-500">Text-based PDFs only. Encrypted or scanned-image files are rejected.</p>
          <input ref={fileRef} type="file" accept="application/pdf" data-testid="pdf-input" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPdf(f); e.currentTarget.value = ''; }} />
          <PrimaryButton onClick={() => fileRef.current?.click()} disabled={busy === 'pdf'}>{busy === 'pdf' ? 'Uploading…' : 'Choose PDF'}</PrimaryButton>
        </Card>

        <Card>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Globe size={16} color={RCP_ACCENT} /> Website</div>
          <Field label="URL"><TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/help" /></Field>
          <label className="mb-3 flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={crawl} onChange={(e) => setCrawl(e.target.checked)} /> Crawl same-domain pages (bounded)
          </label>
          <PrimaryButton onClick={addWebsite} disabled={busy === 'web' || !url.trim()}>{busy === 'web' ? 'Queuing…' : 'Add website'}</PrimaryButton>
          <p className="mt-2 text-xs text-slate-500">Runs as a background job. Localhost/private addresses are blocked.</p>
        </Card>
      </div>
    </Section>
  );
}

function SourceList({ sources, onChange, setErr }: { sources: RcpKnowledgeSource[]; onChange: () => void; setErr: (s: string) => void }) {
  async function act(fn: Promise<{ backendUp: boolean; error?: string }>) {
    const r = await fn;
    if (!r.backendUp || r.error) setErr(r.error || 'Action failed.');
    onChange();
  }
  return (
    <Section title="Sources" sub={`${sources.length} source${sources.length === 1 ? '' : 's'}`}>
      {sources.length === 0 ? (
        <Card><p className="text-sm text-slate-500">No knowledge sources yet. Add text, a PDF or a website above.</p></Card>
      ) : (
        <div className="space-y-2">
          {sources.map((s) => {
            const st = sourceStatus(s.index_status);
            return (
              <Card key={s.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className="capitalize text-slate-500">{s.source_type}</span>
                      <span className="truncate">{s.title || s.url || s.filename || s.id}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <Pill color={st.color}>{st.label}</Pill>
                      <span>{s.chunk_count ?? 0} chunks</span>
                      {s.page_count ? <span>· {s.page_count} pages</span> : null}
                      <span>· {fmtDate(s.updated_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.source_type === 'website' && (
                      <GhostButton onClick={() => act(receptionistApi.reindexSource(s.id))} aria-label="Reindex"><RefreshCw size={14} /></GhostButton>
                    )}
                    {s.index_status !== 'archived' && (
                      <GhostButton onClick={() => act(receptionistApi.archiveSource(s.id))} aria-label="Archive"><Archive size={14} /></GhostButton>
                    )}
                    <GhostButton onClick={() => act(receptionistApi.deleteSource(s.id))} aria-label="Delete"><Trash2 size={14} /></GhostButton>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function RetrievalTest() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<RcpRetrievalResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!q.trim()) return;
    setBusy(true);
    const r = await receptionistApi.retrievalTest(q);
    setBusy(false);
    setRes(r.backendUp ? (r as RcpRetrievalResult) : null);
  }

  return (
    <Section title="Retrieval test" sub="See exactly what evidence the assistant would use — or whether it's a knowledge gap.">
      <Card>
        <div className="flex gap-2">
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question…"
            onKeyDown={(e) => { if (e.key === 'Enter') void run(); }} data-testid="retrieval-query" />
          <PrimaryButton onClick={run} disabled={busy || !q.trim()}><Search size={14} /> {busy ? 'Testing…' : 'Test'}</PrimaryButton>
        </div>
        {res && (
          <div className="mt-4" data-testid="retrieval-result">
            {!res.confident ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Knowledge gap — the assistant would say it needs to check, not invent an answer.
              </div>
            ) : (
              <div className="space-y-2">
                {res.evidence.map((ev, i) => (
                  <div key={ev.chunk_id || i} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Pill color={RCP_ACCENT}>{ev.source_type || 'source'}</Pill>
                      <span>score {ev.score.toFixed(2)}</span>
                      <span>· {ev.method}</span>
                      {ev.url ? <a href={ev.url} className="truncate text-slate-400 underline" target="_blank" rel="noreferrer">{ev.url}</a> : null}
                      {ev.page ? <span>· p.{ev.page}</span> : null}
                    </div>
                    <p className="text-slate-700">{ev.text.slice(0, 280)}{ev.text.length > 280 ? '…' : ''}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </Section>
  );
}
