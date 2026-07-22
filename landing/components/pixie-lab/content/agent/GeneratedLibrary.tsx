'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Copy, Check, Files, Archive, ArchiveRestore, Trash2, FileText } from 'lucide-react';
import type { ContentType, ContentStatus, DocumentEnvelope, ContentTypeSpec } from '@/lib/pixie-lab/contentAgentTypes';
import {
  archiveDocument, deleteDocument, duplicateDocument, getContentTypes, getDocument,
  listDocuments, restoreDocument,
} from '@/lib/pixie-lab/contentAgentClient';
import { copyText, EmptyState, ErrorNote, GhostButton, inputClass, Spinner, StatusBadge } from './ui';
import { DocumentEditor } from './DocumentEditor';

const PAGE_SIZE = 12;

/**
 * GeneratedLibrary — the durable library of generated written content. Search by
 * title/tags, filter by content type / status / archived, paginate, and act on
 * documents (open, duplicate, archive/restore, delete). Opening a document mounts
 * the DocumentEditor inline. Media assets live in a separate route.
 */
export function GeneratedLibrary() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [types, setTypes] = useState<ContentTypeSpec[]>([]);
  const [docs, setDocs] = useState<DocumentEnvelope[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ContentType | ''>('');
  const [statusFilter, setStatusFilter] = useState<ContentStatus | ''>('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [copiedId, setCopiedId] = useState('');

  useEffect(() => { getContentTypes().then((r) => { if (r.ok) setTypes(r.data.content_types); }); }, []);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const r = await listDocuments({
      query, content_type: typeFilter, status: statusFilter,
      include_archived: includeArchived, page, page_size: PAGE_SIZE, sort: 'updated',
    });
    if (!r.ok) { setError(r.error.message); setDocs([]); setLoading(false); return; }
    setError('');
    setDocs(r.data.documents);
    setTotal(r.data.total);
    setLoading(false);
  }, [query, typeFilter, statusFilter, includeArchived, page]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);
  // reset to page 1 whenever a filter changes
  useEffect(() => { setPage(1); }, [query, typeFilter, statusFilter, includeArchived]);

  const typeLabel = useMemo(() => {
    const m = new Map(types.map((t) => [t.content_type, t.label]));
    return (ct: ContentType) => m.get(ct) || ct.replace(/_/g, ' ');
  }, [types]);

  if (openId) {
    return <DocumentEditor docId={openId} onClose={() => { setOpenId(null); fetchDocs(); }} onChanged={fetchDocs} />;
  }

  async function act(id: string, fn: () => Promise<{ ok: boolean; error?: { message: string } }>) {
    setBusyId(id); setError('');
    const r = await fn();
    setBusyId('');
    if (!r.ok && r.error) { setError(r.error.message); return; }
    fetchDocs();
  }

  async function remove(id: string, title: string) {
    if (!window.confirm(`Delete “${title || 'this document'}”? This cannot be undone.`)) return;
    act(id, () => deleteDocument(id));
  }

  async function quickCopy(id: string) {
    const d = await getDocument(id);
    if (d.ok && d.data.current_version) {
      if (await copyText(d.data.current_version.text)) { setCopiedId(id); setTimeout(() => setCopiedId(''), 1500); }
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 grid gap-2.5 sm:grid-cols-[1fr_auto_auto] sm:items-center">
        <div className="relative">
          <label htmlFor="ca-lib-search" className="sr-only">Search content</label>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pl-text-muted)]" />
          <input id="ca-lib-search" className={`${inputClass} pl-9`} placeholder="Search by title or tag…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <label htmlFor="ca-lib-type" className="sr-only">Filter by type</label>
          <select id="ca-lib-type" className={inputClass} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ContentType | '')}>
            <option value="">All types</option>
            {types.map((t) => <option key={t.content_type} value={t.content_type}>{t.label}</option>)}
          </select>
          <label htmlFor="ca-lib-status" className="sr-only">Filter by status</label>
          <select id="ca-lib-status" className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ContentStatus | '')}>
            <option value="">Any status</option>
            <option value="draft">Draft</option>
            <option value="ready">Ready</option>
          </select>
        </div>
        <label className="inline-flex items-center gap-2 whitespace-nowrap text-[12.5px] font-semibold text-[var(--pl-text-muted)]">
          <input type="checkbox" className="h-4 w-4 accent-[var(--pl-green)]" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
          Include archived
        </label>
      </div>

      {error && <div className="mb-3"><ErrorNote>{error}</ErrorNote></div>}

      {loading ? (
        <Spinner label="Loading content…" />
      ) : docs.length === 0 ? (
        <EmptyState
          title={query || typeFilter || statusFilter ? 'No matching content' : 'No content yet'}
          body={query || typeFilter || statusFilter ? 'Try clearing the filters, or generate new content.' : 'Generate your first piece of written content to see it saved here.'}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="list">
          {docs.map((env) => {
            const d = env.document;
            return (
              <li key={env.id} className="flex flex-col rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--pl-surface-soft)] text-[var(--pl-text-muted)]"><FileText size={15} /></span>
                  <StatusBadge status={d.status} />
                  <span className="ml-auto text-[11px] text-[var(--pl-text-muted)]">{typeLabel(d.content_type)}</span>
                </div>
                <button onClick={() => setOpenId(env.id)} className="text-left font-display text-[14px] font-bold text-[var(--pl-text)] transition hover:text-[var(--pl-green)] focus:outline-none focus-visible:underline">
                  {d.title || 'Untitled'}
                </button>
                {d.tags?.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {d.tags.slice(0, 4).map((t) => <span key={t} className="rounded bg-[var(--pl-surface-soft)] px-1.5 py-0.5 text-[10.5px] text-[var(--pl-text-muted)]">{t}</span>)}
                  </div>
                )}
                <p className="mt-1 text-[11px] text-[var(--pl-text-muted)]">Updated {fmtDate(d.updated_at)}</p>

                <div className="mt-3 flex flex-wrap gap-1.5 pt-1 text-[var(--pl-text-muted)]">
                  <IconBtn label="Open" onClick={() => setOpenId(env.id)}><FileText size={13} /></IconBtn>
                  <IconBtn label="Copy text" onClick={() => quickCopy(env.id)}>{copiedId === env.id ? <Check size={13} /> : <Copy size={13} />}</IconBtn>
                  <IconBtn label="Duplicate" disabled={busyId === env.id} onClick={() => act(env.id, () => duplicateDocument(env.id))}><Files size={13} /></IconBtn>
                  {d.status === 'archived'
                    ? <IconBtn label="Restore" disabled={busyId === env.id} onClick={() => act(env.id, () => restoreDocument(env.id))}><ArchiveRestore size={13} /></IconBtn>
                    : <IconBtn label="Archive" disabled={busyId === env.id} onClick={() => act(env.id, () => archiveDocument(env.id))}><Archive size={13} /></IconBtn>}
                  <IconBtn label="Delete" disabled={busyId === env.id} onClick={() => remove(env.id, d.title)}><Trash2 size={13} /></IconBtn>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-3 text-[12.5px] text-[var(--pl-text-muted)]">
          <GhostButton disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</GhostButton>
          <span>Page {page} of {pages}</span>
          <GhostButton disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>Next</GhostButton>
        </div>
      )}
    </div>
  );
}

function IconBtn({ label, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button {...rest} aria-label={label} title={label} className="grid h-7 w-7 place-items-center rounded-md border border-[var(--pl-border)] transition hover:text-[var(--pl-text)] disabled:opacity-50">
      {children}
    </button>
  );
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}
