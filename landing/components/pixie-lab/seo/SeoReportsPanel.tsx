'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type { SeoCrawlReport, SeoCrawlIssue } from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { Ring } from './Ring';
import Link from 'next/link';
import { seoRoutes } from '@/lib/pixie-lab/seoRoutes';

const ACCENT = '#14B8A6';
const SEV_COLOR: Record<string, string> = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#3b82f6', info: '#64748b' };

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCsv(report: SeoCrawlReport, issues: SeoCrawlIssue[]) {
  const rows: string[] = [
    'site_id,crawl_job_id,score,created_at',
    `"${report.site_id}","${report.crawl_job_id}",${report.score},"${report.created_at ?? ''}"`,
    '',
    'issue_id,rule_key,category,severity,status,recommendation,page_id',
    ...issues.map((i) =>
      [
        `"${i.id}"`,
        `"${i.rule_key}"`,
        `"${i.category ?? ''}"`,
        `"${i.severity ?? ''}"`,
        `"${i.status ?? ''}"`,
        `"${(i.recommendation ?? '').replace(/"/g, '""')}"`,
        `"${i.page_id ?? ''}"`,
      ].join(','),
    ),
  ];
  downloadFile(`seo-report-${report.site_id}-${new Date().toISOString().slice(0, 10)}.csv`, rows.join('\n'), 'text/csv');
}

function exportJson(report: SeoCrawlReport, issues: SeoCrawlIssue[]) {
  const payload = { report, issues, exported_at: new Date().toISOString() };
  downloadFile(
    `seo-report-${report.site_id}-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(payload, null, 2),
    'application/json',
  );
}

function ScoreCategoryBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 flex-none truncate text-[12.5px] capitalize text-[var(--pl-text-muted)]">{label.replace(/_/g, ' ')}</span>
      <div className="flex-1">
        <div className="h-2 overflow-hidden rounded-full bg-[var(--pl-surface-soft)]">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
        </div>
      </div>
      <span className="w-10 text-right text-[12.5px] font-bold" style={{ color }}>{pct}</span>
    </div>
  );
}

function IssueSummaryTable({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts).filter(([, n]) => n > 0);
  if (!entries.length) return <p className="text-[13px] text-[var(--pl-text-muted)]">No issues recorded.</p>;
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--pl-border)]">
      {entries.map(([key, count], i) => (
        <div
          key={key}
          className={`flex items-center justify-between px-4 py-2.5 ${i > 0 ? 'border-t border-[var(--pl-border)]' : ''}`}
        >
          <span className="flex items-center gap-2 text-[13px] font-semibold capitalize text-[var(--pl-text-soft)]">
            <span className="h-2 w-2 rounded-full" style={{ background: SEV_COLOR[key] ?? '#64748b' }} />
            {key.replace(/_/g, ' ')}
          </span>
          <span className="font-bold" style={{ color: SEV_COLOR[key] ?? 'var(--pl-text)' }}>{count}</span>
        </div>
      ))}
    </div>
  );
}

/** Print-friendly styles injected into the document head only during print. */
const PRINT_STYLES = `
@media print {
  .no-print { display: none !important; }
  body { background: white !important; color: black !important; }
  .print-section { page-break-inside: avoid; }
}
`;

export function SeoReportsPanel({
  initialSiteId,
  initialCrawlJobId,
}: {
  initialSiteId?: string;
  initialCrawlJobId?: string;
}) {
  const [status, setStatus] = useState<'loading' | 'done' | 'offline' | 'empty'>('loading');
  const [report, setReport] = useState<SeoCrawlReport | null>(null);
  const [issues, setIssues] = useState<SeoCrawlIssue[]>([]);

  const load = useCallback(async () => {
    setStatus('loading');
    const rEnv = await seoApi.getReport({ site_id: initialSiteId, crawl_job_id: initialCrawlJobId });
    if (!rEnv.backendUp) { setStatus('offline'); return; }
    if (!rEnv.report) { setStatus('empty'); return; }
    const r = rEnv.report;
    setReport(r);

    // Load all issues for this report so we can export them.
    const iEnv = await seoApi.listIssues({ site_id: r.site_id, crawl_job_id: r.crawl_job_id });
    if (iEnv.backendUp) setIssues(iEnv.issues ?? []);

    setStatus('done');
  }, [initialSiteId, initialCrawlJobId]);

  useEffect(() => { load(); }, [load]);

  // Inject print styles once.
  useEffect(() => {
    const el = document.createElement('style');
    el.textContent = PRINT_STYLES;
    document.head.appendChild(el);
    return () => { document.head.removeChild(el); };
  }, []);

  if (status === 'loading') return <div className="mt-6"><LoadingCards count={4} height="h-24" /></div>;
  if (status === 'offline') return <div className="mt-6"><OfflineState service="SEO" action={<button onClick={load} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} /></div>;
  if (status === 'empty' || !report) {
    return (
      <div className="mt-6">
        <EmptyState
          title="No report available"
          body="Reports are generated after a crawl completes. Start a crawl on the Sites page or via Crawl Jobs."
          action={
            <div className="flex items-center gap-3">
              <Link href={seoRoutes.sites()} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Sites</Link>
              <Link href={seoRoutes.crawls()} className="rounded-lg px-4 py-2 text-[13px] font-bold text-[#02120f]" style={{ background: ACCENT }}>Crawl Jobs</Link>
            </div>
          }
        />
      </div>
    );
  }

  const categoryCores = report.category_scores ?? {};
  const issueCounts = report.issue_counts ?? {};

  return (
    <div className="mt-6 space-y-5">
      {/* Score header */}
      <div className="print-section flex flex-wrap items-center gap-6 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5">
        <Ring score={report.score} max={100} size={100} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">SEO Score</p>
          <h2 className="font-display text-2xl font-extrabold text-[var(--pl-text)]">{report.score} / 100</h2>
          {report.created_at && (
            <p className="mt-0.5 text-[12.5px] text-[var(--pl-text-muted)]">
              Report generated {new Date(report.created_at).toLocaleString()}
            </p>
          )}
        </div>
        {/* Export + print actions */}
        <div className="no-print flex items-center gap-2 self-start">
          <button
            onClick={() => exportCsv(report, issues)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]"
          >
            <Download size={13} /> CSV
          </button>
          <button
            onClick={() => exportJson(report, issues)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]"
          >
            <Download size={13} /> JSON
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]"
          >
            <Printer size={13} /> Print
          </button>
        </div>
      </div>

      {/* Category scores */}
      {Object.keys(categoryCores).length > 0 && (
        <div className="print-section rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5">
          <p className="mb-4 text-[11px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">Category scores</p>
          <div className="space-y-3">
            {Object.entries(categoryCores).map(([k, v]) => (
              <ScoreCategoryBar key={k} label={k} value={v as number} />
            ))}
          </div>
        </div>
      )}

      {/* Issue counts */}
      <div className="print-section rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5">
        <p className="mb-4 text-[11px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">Issue summary</p>
        <IssueSummaryTable counts={issueCounts} />
        {issues.length > 0 && (
          <Link
            href={seoRoutes.issues({ site_id: report.site_id, crawl_job_id: report.crawl_job_id })}
            className="no-print mt-4 inline-block text-[13px] font-semibold"
            style={{ color: ACCENT }}
          >
            View all {issues.length} issues →
          </Link>
        )}
      </div>

      {/* Metadata (for print) */}
      <div className="print-section rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">Report metadata</p>
        <div className="space-y-1.5 text-[12.5px]">
          {[
            ['Report ID', report.id],
            ['Site ID', report.site_id],
            ['Crawl job ID', report.crawl_job_id],
          ].map(([label, value]) => (
            <div key={label} className="flex gap-3">
              <span className="w-28 flex-none font-mono text-[11.5px] text-[var(--pl-text-muted)]">{label}</span>
              <span className="break-all font-mono text-[11.5px] text-[var(--pl-text-soft)]">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
