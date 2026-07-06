'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Loader2, ShieldCheck, SkipForward } from 'lucide-react';
import { approvalsApi } from '@/lib/pixie-lab/servicesClient';
import type { ApprovalItem } from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, OfflineState, ErrorState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';

const ACCENT = '#EC4899';

const RISK_COLOR: Record<string, string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#ef4444',
};

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
    >
      {children}
    </span>
  );
}

function ApprovalCard({
  item,
  busy,
  onResolve,
}: {
  item: ApprovalItem;
  busy: boolean;
  onResolve: (id: string, decision: 'approve' | 'reject' | 'skip') => void;
}) {
  const riskColor = RISK_COLOR[item.risk_level || ''] || '#64748b';
  const preview = item.prepared_output?.caption || item.prepared_output?.reply || item.preview || '';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4"
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--pl-text-muted)]">
              {item.capability || item.agent || 'marketing'}
            </span>
            {item.risk_level && <Badge color={riskColor}>{item.risk_level} risk</Badge>}
          </div>
          {preview && (
            <p className="mt-2 text-[13.5px] text-[var(--pl-text-soft)]">{preview}</p>
          )}
          {item.prepared_output?.will_publish_to && (
            <p className="mt-1 text-[12px] text-[var(--pl-text-muted)]">
              Will publish to: {String(item.prepared_output.will_publish_to)}
            </p>
          )}
          {item.created_at && (
            <p className="mt-0.5 text-[11.5px] text-[var(--pl-text-muted)]">
              {new Date(item.created_at).toLocaleString()}
            </p>
          )}
        </div>

        <div className="flex flex-none items-center gap-2">
          <button
            onClick={() => onResolve(item.id, 'skip')}
            disabled={busy}
            title="Skip"
            className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)] disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <SkipForward size={15} />}
          </button>
          <button
            onClick={() => onResolve(item.id, 'reject')}
            disabled={busy}
            title="Reject"
            className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)] disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <X size={15} />}
          </button>
          <button
            onClick={() => onResolve(item.id, 'approve')}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-50"
            style={{ background: ACCENT }}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * MarketingApprovalsPanel — lists pending approvals whose agent field contains
 * 'marketing'. Approve / reject / skip via approvalsApi.resolve. Visual style
 * mirrors ApprovalsView.tsx; uses typed approvalsApi rather than raw fetch.
 */
export function MarketingApprovalsPanel() {
  const [loadStatus, setLoadStatus] = useState<'loading' | 'done' | 'offline' | 'error'>('loading');
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadStatus('loading');
    approvalsApi.list().then((d) => {
      if (!d.backendUp) { setLoadStatus('offline'); return; }
      if (d.error) { setLoadStatus('error'); return; }
      const all = Array.isArray(d.items) ? d.items : [];
      // Filter to marketing-related pending items
      const marketing = all.filter(
        (i) =>
          i.status === 'pending' &&
          (typeof i.agent === 'string' ? i.agent.includes('marketing') : true),
      );
      setItems(marketing);
      setLoadStatus('done');
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleResolve(id: string, decision: 'approve' | 'reject' | 'skip') {
    setBusyId(id);
    await approvalsApi.resolve(id, decision);
    setBusyId(null);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  if (loadStatus === 'loading') return <div className="mt-6"><LoadingCards count={3} height="h-24" /></div>;
  if (loadStatus === 'offline') return (
    <div className="mt-6">
      <OfflineState
        service="Marketing"
        action={<button onClick={load} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>}
      />
    </div>
  );
  if (loadStatus === 'error') return (
    <div className="mt-6">
      <ErrorState
        title="Couldn't load approvals"
        body="The approvals service returned an error."
        action={<button onClick={load} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>}
      />
    </div>
  );

  if (items.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState
          title="Nothing to approve"
          body="When the marketing agent prepares a reply or post that needs your go-ahead, it'll show up here."
        />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center gap-2.5">
        <ShieldCheck size={18} style={{ color: ACCENT }} />
        <p className="text-[13px] text-[var(--pl-text-muted)]">
          {items.length} pending approval{items.length === 1 ? '' : 's'} — nothing publishes until you approve.
        </p>
      </div>
      <AnimatePresence>
        {items.map((item) => (
          <ApprovalCard
            key={item.id}
            item={item}
            busy={busyId === item.id}
            onResolve={handleResolve}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
