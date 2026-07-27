'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ExternalLink, Loader2 } from 'lucide-react';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type { SeoCrawledPageSummary } from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, OfflineState, LoadingCards, ErrorState } from '@/components/pixie-lab/services/ServiceStates';
import Link from 'next/link';
import { seoRoutes } from '@/lib/pixie-lab/seoRoutes';

const ACCENT = '#14B8A6';
const PAGE_SIZE = 50;

function statusBadge(code?: number) {
  if (!code) return { label: '?', color: '#64748b' };
  if (code < 300) return { label: String(code), color: '#22c55e' };
  if (code < 400) return { label: String(code), color: '#f59e0b' };
  return { label: String(code), color: '#ef4444' };
}

function indexabilityColor(idx?: string) {
  if (!idx) return '#64748b';
  if (idx.toLowerCase().includes('index')) return '#22c55e';
  return '#f59e0b';
}

function PageDetailDrawer({ page, onClose }: { page: SeoCrawledPageSummary; onClose: () => void }) {
  const badge = statusBadge(page.status_code);
  return (
    <div className="mt-2 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4 text-[12.5px]">
      <div className="mb-3 flex items-center justify-between">
        <a href={page.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-semibold" style={{ color: ACCENT }}>
          <ExternalLink size={12} /> Open URL
        </a>
        <button onClick={onClose} className="text-[var(--pl-text-muted)] hover:text-[var(--pl-text)]">
          <ChevronUp size={14} />
        </button>
      </div>
      <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {[
          ['Title', page.title],
          ['Meta description', page.meta_description],
          ['H1', page.h1],
          ['Canonical', page.canonical],
          ['Content type', page.content_type],
          ['Status code', page.status_code != null ? String(page.status_code) : undefined],
          ['Indexability', page.indexability],
          ['Word count', page.word_count != null ? String(page.word_count) : undefined],
          ['Internal links in', page.internal_links_in != null ? String(page.internal_links_in) : undefined],
          ['Internal links out', page.internal_links_out != null ? String(page.internal_links_out) : undefined],
          ['Response time', page.response_time_ms != null ? `${page.response_time_ms} ms` : undefined],
          ['Page size', page.page_size_bytes != null ? `${Math.round(page.page_size_bytes / 1024)} KB` : undefined],
          ['Crawled at', page.crawled_at ? new Date(page.crawled_at).toLocaleString() : undefined],
        ]
          .filter(([, v]) => v != null)
          .map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <span className="w-36 flex-none text-[var(--pl-text-muted)]">{label}</span>
              <span className="break-all text-[var(--pl-text-soft)]">{value}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

function PageRow({ page }: { page: SeoCrawledPageSummary }) {
  const [expanded, setExpanded] = useState(false);
  const badge = statusBadge(page.status_code);
  const idxColor = indexabilityColor(page.indexability);

  return (
    <div>
      <div
        className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-3 hover:bg-[var(--pl-surface-hover)] transition"
        onClick={() => setExpanded((e) => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded((x) => !x); }}
        aria-expanded={expanded}
      >
        <span
          className="mt-0.5 flex-none rounded-full px-2 py-0.5 text-[10.5px] font-bold"
          style={{ background: `color-mix(in srgb, ${badge.color} 16%, transparent)`, color: badge.color }}
        >
          {badge.label}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[13.5px] font-bold text-[var(--pl-text)]">{page.title || <span className="italic text-[var(--pl-text-muted)]">No title</span>}</p>
          <p className="truncate text-[12px] text-[var(--pl-text-muted)]">{page.url}</p>
          <div className="mt-1 flex flex-wrap gap-3 text-[11.5px] text-[var(--pl-text-muted)]">
            {page.indexability && <span style={{ color: idxColor }}>{page.indexability}</span>}
            {page.word_count != null && <span>{page.word_count} words</span>}
            {page.response_time_ms != null && <span>{page.response_time_ms} ms</span>}
          </div>
        </div>
        {expanded ? <ChevronUp size={14} className="mt-0.5 flex-none text-[var(--pl-text-muted)]" /> : <ChevronDown size={14} className="mt-0.5 flex-none text-[var(--pl-text-muted)]" />}
      </div>
      {expanded && <PageDetailDrawer page={page} onClose={() => setExpanded(false)} />}
    </div>
  );
}

export function SeoPagesPanel({ initialCrawlJobId }: { initialCrawlJobId?: string }) {
  const [status, setStatus] = useState<'loading' | 'done' | 'offline' | 'no-job'>('loading');
  const [pages, setPages] = useState<SeoCrawledPageSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [crawlJobId] = useState(initialCrawlJobId);

  const load = useCallback(async (off: number) => {
    if (!crawlJobId) { setStatus('no-job'); return; }
    setStatus('loading');
    const d = await seoApi.listPages(crawlJobId, { limit: PAGE_SIZE, offset: off });
    if (!d.backendUp) { setStatus('offline'); return; }
    setPages(d.pages ?? []);
    setTotal(d.total ?? 0);
    setOffset(off);
    setStatus('done');
  }, [crawlJobId]);

  useEffect(() => { load(0); }, [load]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  if (status === 'no-job') {
    return (
      <div className="mt-6">
        <EmptyState
          title="Select a crawl job"
          body="Pages are associated with a specific crawl job. Go to Crawl Jobs and open the Pages view for a completed crawl."
          action={<Link href={seoRoutes.crawls()} className="rounded-lg px-4 py-2 text-[13px] font-bold text-[#02120f]" style={{ background: ACCENT }}>Crawl Jobs</Link>}
        />
      </div>
    );
  }
  if (status === 'loading') return <div className="mt-6"><LoadingCards count={8} height="h-16" /></div>;
  if (status === 'offline') return <div className="mt-6"><OfflineState service="SEO" action={<button onClick={() => load(offset)} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} /></div>;

  if (!pages.length) {
    return (
      <div className="mt-6">
        <EmptyState title="No pages found" body="The crawl may not have completed yet, or this job has no crawled pages." />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <p className="text-[13px] text-[var(--pl-text-muted)]">{total} page{total !== 1 ? 's' : ''} crawled</p>

      <div className="space-y-2">
        {pages.map((p) => <PageRow key={p.id} page={p} />)}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => load(offset - PAGE_SIZE)}
            disabled={offset === 0}
            className="rounded-lg border border-[var(--pl-border)] p-2 text-[var(--pl-text-muted)] disabled:opacity-40 transition hover:text-[var(--pl-text)]"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-[13px] text-[var(--pl-text-muted)]">Page {currentPage} of {totalPages}</span>
          <button
            onClick={() => load(offset + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total}
            className="rounded-lg border border-[var(--pl-border)] p-2 text-[var(--pl-text-muted)] disabled:opacity-40 transition hover:text-[var(--pl-text)]"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
