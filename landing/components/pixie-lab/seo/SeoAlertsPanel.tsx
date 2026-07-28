'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, RefreshCw, Loader2, CheckCheck, X } from 'lucide-react';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type { SeoDurableSite, SeoAlert } from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { seoRoutes } from '@/lib/pixie-lab/seoRoutes';
import Link from 'next/link';

const ACCENT = '#14B8A6';

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
};

function severityIcon(severity?: string) {
  const color = SEVERITY_COLOR[severity ?? ''] ?? '#64748b';
  return (
    <span
      className="grid h-9 w-9 flex-none place-items-center rounded-xl"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
    >
      <Bell size={16} />
    </span>
  );
}

function AlertCard({ alert, onUpdate }: { alert: SeoAlert; onUpdate: () => void }) {
  const [reading, setReading] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  async function markRead() {
    setReading(true);
    await seoApi.readAlert(alert.id);
    setReading(false);
    onUpdate();
  }

  async function dismiss() {
    setDismissing(true);
    await seoApi.dismissAlert(alert.id);
    setDismissing(false);
    onUpdate();
  }

  const isDismissed = alert.dismissed;
  const color = SEVERITY_COLOR[alert.severity ?? ''] ?? '#64748b';

  return (
    <div
      className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4"
      style={{ opacity: isDismissed ? 0.5 : 1 }}
    >
      <div className="flex items-start gap-3">
        {severityIcon(alert.severity)}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-[14px] font-bold text-[var(--pl-text)]">{alert.title}</p>
            {alert.severity && (
              <span
                className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold capitalize"
                style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
              >
                {alert.severity}
              </span>
            )}
            {!alert.read && (
              <span className="h-2 w-2 rounded-full" style={{ background: ACCENT }} title="Unread" />
            )}
          </div>
          {alert.body && <p className="mt-1 text-[13px] leading-relaxed text-[var(--pl-text-muted)]">{alert.body}</p>}
          {alert.type && (
            <p className="mt-1 text-[11.5px] text-[var(--pl-text-muted)]">{alert.type.replace(/_/g, ' ')}</p>
          )}
          {alert.created_at && (
            <p className="mt-1 text-[11px] text-[var(--pl-text-muted)]">{new Date(alert.created_at).toLocaleString()}</p>
          )}
        </div>
      </div>
      {!isDismissed && (
        <div className="mt-3 flex items-center gap-2 border-t border-[var(--pl-border)] pt-3">
          {!alert.read && (
            <button
              onClick={markRead}
              disabled={reading}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--pl-text-soft)] hover:text-[var(--pl-text)] disabled:opacity-50"
            >
              {reading ? <Loader2 size={12} className="animate-spin" /> : <CheckCheck size={12} />} Mark read
            </button>
          )}
          <button
            onClick={dismiss}
            disabled={dismissing}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--pl-text-soft)] hover:text-[var(--pl-text)] disabled:opacity-50"
          >
            {dismissing ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />} Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

export function SeoAlertsPanel({ initialSiteId }: { initialSiteId?: string }) {
  const [sitesStatus, setSitesStatus] = useState<'loading' | 'done' | 'offline'>('loading');
  const [sites, setSites] = useState<SeoDurableSite[]>([]);
  const [selectedSite, setSelectedSite] = useState<string | null>(initialSiteId ?? null);
  const [alerts, setAlerts] = useState<SeoAlert[]>([]);
  const [generating, setGenerating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'dismissed'>('unread');

  const loadSites = useCallback(async () => {
    setSitesStatus('loading');
    const d = await seoApi.listSites();
    if (!d.backendUp) { setSitesStatus('offline'); return; }
    const ss = d.sites ?? [];
    setSites(ss);
    if (!selectedSite && ss.length > 0) setSelectedSite(ss[0].id);
    setSitesStatus('done');
  }, [selectedSite]);

  const loadAlerts = useCallback(async (siteId?: string) => {
    const d = await seoApi.alerts(siteId);
    if (d.backendUp) { setAlerts(d.alerts ?? []); setLastUpdated(new Date()); }
  }, []);

  useEffect(() => { loadSites(); }, [loadSites]);
  useEffect(() => { if (sitesStatus === 'done') loadAlerts(selectedSite ?? undefined); }, [sitesStatus, selectedSite, loadAlerts]);

  async function generate() {
    setGenerating(true);
    await seoApi.generateAlerts(selectedSite ?? undefined);
    setGenerating(false);
    loadAlerts(selectedSite ?? undefined);
  }

  if (sitesStatus === 'loading') return <div className="mt-6"><LoadingCards count={3} height="h-24" /></div>;
  if (sitesStatus === 'offline') {
    return (
      <div className="mt-6">
        <OfflineState service="SEO" action={<button onClick={loadSites} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} />
      </div>
    );
  }

  if (sites.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState
          title="No sites registered"
          body="Register a site to start receiving SEO alerts for ranking drops, indexing issues, and more."
          action={
            <Link href={seoRoutes.sites()} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-[#02120f]" style={{ background: ACCENT }}>
              Add a site
            </Link>
          }
        />
      </div>
    );
  }

  const filtered = filter === 'all'
    ? alerts
    : filter === 'unread'
    ? alerts.filter((a) => !a.read && !a.dismissed)
    : alerts.filter((a) => a.dismissed);

  const unreadCount = alerts.filter((a) => !a.read && !a.dismissed).length;

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedSite ?? ''}
          onChange={(e) => { setSelectedSite(e.target.value || null); }}
          className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3 py-2 text-[13px] text-[var(--pl-text)] outline-none focus:border-[var(--pl-green)]"
        >
          <option value="">All sites</option>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.display_name || s.domain}</option>)}
        </select>
        <button
          onClick={generate}
          disabled={generating}
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-bold text-[#02120f] disabled:opacity-50"
          style={{ background: ACCENT }}
        >
          {generating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {generating ? 'Refreshing…' : 'Refresh alerts'}
        </button>
        {lastUpdated && (
          <span className="ml-auto text-[11.5px] text-[var(--pl-text-muted)]">Updated {lastUpdated.toLocaleTimeString()}</span>
        )}
      </div>

      {alerts.length > 0 && (
        <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-1">
          {([
            { key: 'unread', label: `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
            { key: 'all', label: 'All' },
            { key: 'dismissed', label: 'Dismissed' },
          ] as { key: 'unread' | 'all' | 'dismissed'; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition"
              style={{
                background: filter === key ? `color-mix(in srgb, ${ACCENT} 16%, transparent)` : 'transparent',
                color: filter === key ? 'var(--pl-text)' : 'var(--pl-text-muted)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title={alerts.length === 0 ? 'No alerts yet' : `No ${filter} alerts`}
          body={
            alerts.length === 0
              ? 'Click Refresh alerts to check for ranking drops, crawl failures, and other SEO events.'
              : `No alerts match the "${filter}" filter.`
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered
            .sort((a, b) => {
              const sev = { critical: 0, warning: 1, info: 2 };
              return (sev[a.severity ?? 'info'] ?? 2) - (sev[b.severity ?? 'info'] ?? 2);
            })
            .map((alert) => (
              <AlertCard key={alert.id} alert={alert} onUpdate={() => loadAlerts(selectedSite ?? undefined)} />
            ))}
        </div>
      )}
    </div>
  );
}
