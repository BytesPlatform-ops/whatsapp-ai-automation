'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Save, RefreshCw, Archive, History, Copy, Check } from 'lucide-react';
import type { ContentType, ContentStatus, DocumentDetail, VersionEnvelope } from '@/lib/pixie-lab/contentAgentTypes';
import {
  archiveDocument, createManualVersion, getDocument, getVersions, regenerateDocument,
  restoreDocument, setCurrentVersion, updateDocument,
} from '@/lib/pixie-lab/contentAgentClient';
import { StructuredView } from './StructuredView';
import { VersionHistory } from './VersionHistory';
import { ErrorNote, GhostButton, PrimaryButton, Spinner, StatusBadge, copyText, inputClass } from './ui';

/**
 * DocumentEditor — opens a saved content document. Shows the current version,
 * supports editing (saved as a NEW version — never overwrites), regeneration,
 * version history with restore, rename, tags, status and archive. All data flows
 * through the typed client → authenticated proxy.
 */
export function DocumentEditor({ docId, onClose, onChanged }: { docId: string; onClose: () => void; onChanged?: () => void }) {
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [versions, setVersions] = useState<VersionEnvelope[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [copied, setCopied] = useState(false);
  const [viewing, setViewing] = useState<VersionEnvelope | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [d, v] = await Promise.all([getDocument(docId), getVersions(docId)]);
    if (!d.ok) { setError(d.error.message); setLoading(false); return; }
    setDetail(d.data);
    setTitle(d.data.document.title);
    setTags((d.data.document.tags || []).join(', '));
    setDraft(d.data.current_version?.text || '');
    if (v.ok) setVersions(v.data.versions);
    setViewing(null);
    setLoading(false);
  }, [docId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner label="Opening document…" />;
  if (error && !detail) return <ErrorNote>{error}</ErrorNote>;
  if (!detail) return null;

  const doc = detail.document;
  const contentType = doc.content_type as ContentType;
  const shown = viewing ? viewing.version : detail.current_version;
  const structured = shown?.structured && Object.keys(shown.structured).length > 0 ? shown.structured : null;

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: { message: string } }>) {
    setBusy(key); setError('');
    const r = await fn();
    setBusy('');
    if (!r.ok && r.error) { setError(r.error.message); return false; }
    onChanged?.();
    return true;
  }

  async function saveEdit() {
    if (await run('edit', () => createManualVersion(docId, { title: title.trim() || doc.title, text: draft }))) {
      setEditing(false);
      await load();
    }
  }
  async function saveMeta() {
    await run('meta', () => updateDocument(docId, { title: title.trim() || doc.title, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) }));
    await load();
  }
  async function changeStatus(status: ContentStatus) {
    await run('status', () => updateDocument(docId, { status }));
    await load();
  }
  async function doRegenerate() {
    if (await run('regen', () => regenerateDocument(docId))) await load();
  }
  async function doArchive() {
    if (doc.status === 'archived') { if (await run('arch', () => restoreDocument(docId))) { await load(); } return; }
    if (!window.confirm('Archive this document? It will be hidden from the main library but not deleted.')) return;
    if (await run('arch', () => archiveDocument(docId))) { onClose(); }
  }
  async function restore(v: VersionEnvelope) {
    if (await run(v.id, () => setCurrentVersion(docId, v.id))) await load();
  }
  async function doCopy() {
    if (await copyText(shown?.text || '')) { setCopied(true); setTimeout(() => setCopied(false), 1500); }
  }

  return (
    <div>
      <button onClick={onClose} className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)]">
        <ArrowLeft size={14} /> Back to library
      </button>

      {/* Header: title + status + meta */}
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[12rem]">
          <label htmlFor="ca-doc-title" className="sr-only">Title</label>
          <input id="ca-doc-title" className={`${inputClass} font-display text-[15px] font-bold`} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveMeta} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={doc.status} />
            <span className="text-[11.5px] text-[var(--pl-text-muted)]">{contentType.replace(/_/g, ' ')}</span>
            <span className="text-[11.5px] text-[var(--pl-text-muted)]">· {detail.version_count} version{detail.version_count === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {doc.status !== 'ready' && <GhostButton onClick={() => changeStatus('ready')} disabled={busy === 'status'}>Mark ready</GhostButton>}
          {doc.status === 'ready' && <GhostButton onClick={() => changeStatus('draft')} disabled={busy === 'status'}>Move to draft</GhostButton>}
          <GhostButton onClick={doArchive} disabled={busy === 'arch'}><Archive size={14} /> {doc.status === 'archived' ? 'Restore' : 'Archive'}</GhostButton>
        </div>
      </div>

      {error && <div className="mb-3"><ErrorNote>{error}</ErrorNote></div>}

      {/* Tags */}
      <div className="mb-4">
        <label htmlFor="ca-doc-tags" className="mb-1.5 block text-[12px] font-semibold text-[var(--pl-text-muted)]">Tags</label>
        <input id="ca-doc-tags" className={inputClass} placeholder="promo, summer (comma-separated)" value={tags} onChange={(e) => setTags(e.target.value)} onBlur={saveMeta} />
      </div>

      {/* Content */}
      <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="flex-1 font-display text-[13.5px] font-bold text-[var(--pl-text)]">
            {viewing ? `Viewing v${viewing.version.version_number}` : 'Current version'}
          </p>
          <button onClick={doCopy} className="inline-flex items-center gap-1 rounded-md border border-[var(--pl-border)] px-2 py-1 text-[11.5px] font-semibold text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)]">
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
          </button>
          {!viewing && (
            <button onClick={() => setEditing((e) => !e)} className="inline-flex items-center gap-1 rounded-md border border-[var(--pl-border)] px-2 py-1 text-[11.5px] font-semibold text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)]" aria-pressed={editing}>
              {editing ? 'Cancel' : 'Edit'}
            </button>
          )}
          {viewing && <GhostButton onClick={() => setViewing(null)}>Back to current</GhostButton>}
        </div>

        {structured && !editing && <StructuredView contentType={contentType} data={structured} />}

        {editing && !viewing ? (
          <>
            <textarea aria-label="Edit content" className={`${inputClass} min-h-[240px] resize-y font-mono text-[12.5px] leading-relaxed`} value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div className="mt-3 flex gap-3">
              <PrimaryButton busy={busy === 'edit'} disabled={busy === 'edit'} onClick={saveEdit}><Save size={15} /> Save as new version</PrimaryButton>
              <GhostButton onClick={() => { setEditing(false); setDraft(detail.current_version?.text || ''); }}>Cancel</GhostButton>
            </div>
            <p className="mt-2 text-[11px] text-[var(--pl-text-muted)]">Edits are saved as a new version — previous versions are never overwritten.</p>
          </>
        ) : (
          !structured && <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--pl-text)]">{shown?.text || '—'}</div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-3">
        <PrimaryButton busy={busy === 'regen'} disabled={busy === 'regen'} onClick={doRegenerate}><RefreshCw size={15} /> Regenerate</PrimaryButton>
        <GhostButton onClick={() => setShowHistory((s) => !s)} aria-expanded={showHistory}><History size={14} /> {showHistory ? 'Hide' : 'Version'} history ({versions.length})</GhostButton>
      </div>

      {showHistory && (
        <div className="mt-4">
          <VersionHistory versions={versions} currentVersionId={doc.current_version_id} busyId={busy} onView={(v) => { setViewing(v); setEditing(false); }} onRestore={restore} />
        </div>
      )}
    </div>
  );
}
