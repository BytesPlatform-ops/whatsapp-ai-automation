'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { History, ArrowUpRight } from 'lucide-react';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type { SeoHistoryAudit } from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';

const ACCENT = '#14B8A6';

function scoreColor(pct: number) { return pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444'; }

export function SeoHistoryPanel() {
  const [status, setStatus] = useState<'loading' | 'done' | 'offline'>('loading');
  const [audits, setAudits] = useState<SeoHistoryAudit[]>([]);

  useEffect(() => {
    seoApi.history().then((d) => {
      if (!d.backendUp) return setStatus('offline');
      setAudits(Array.isArray(d.audits) ? d.audits : []);
      setStatus('done');
    });
  }, []);

  if (status === 'loading') return <div className="mt-6"><LoadingCards count={4} height="h-16" /></div>;
  if (status === 'offline') return <div className="mt-6"><OfflineState service="SEO" /></div>;
  if (!audits.length) {
    return (
      <div className="mt-6">
        <EmptyState
          title="No audits yet"
          body="Run your first SEO audit and it'll show up here so you can track score over time."
          action={<Link href="/pixie-lab/seo/audit" className="rounded-lg px-4 py-2 text-[13px] font-bold text-[#02120f]" style={{ background: ACCENT }}>Run an audit</Link>}
        />
      </div>
    );
  }

  const avg = Math.round(
    audits.reduce((s, a) => s + (a.max_score ? ((a.score ?? 0) / a.max_score) * 100 : 0), 0) / audits.length,
  );
  const sites = new Set(audits.map((a) => a.website_url || a.final_url)).size;

  return (
    <div className="mt-6 space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[['Audits run', String(audits.length)], ['Avg score', `${avg}`], ['Websites', String(sites)]].map(([label, val]) => (
          <div key={label} className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4 text-center">
            <p className="font-display text-2xl font-extrabold text-[var(--pl-text)]">{val}</p>
            <p className="text-[12px] text-[var(--pl-text-muted)]">{label}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)]">
        {audits.map((a, i) => {
          const pct = a.max_score ? Math.round(((a.score ?? 0) / a.max_score) * 100) : 0;
          return (
            <Link
              key={a.id}
              href={`/pixie-lab/seo/audit?audit_id=${encodeURIComponent(a.id)}`}
              className={`flex items-center gap-4 px-4 py-3.5 transition hover:bg-[var(--pl-surface-hover)] ${i > 0 ? 'border-t border-[var(--pl-border)]' : ''}`}
            >
              <span className="grid h-10 w-10 flex-none place-items-center rounded-full text-[13px] font-bold" style={{ background: `color-mix(in srgb, ${scoreColor(pct)} 16%, transparent)`, color: scoreColor(pct) }}>{pct}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-[14px] font-bold text-[var(--pl-text)]">{a.website_url || a.final_url}</p>
                <p className="text-[12px] text-[var(--pl-text-muted)]">
                  {a.platform || 'unknown'} · {a.issue_count ?? 0} issues{a.created_at ? ` · ${new Date(a.created_at).toLocaleDateString()}` : ''}
                </p>
              </div>
              <ArrowUpRight size={16} className="flex-none text-[var(--pl-text-muted)]" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
