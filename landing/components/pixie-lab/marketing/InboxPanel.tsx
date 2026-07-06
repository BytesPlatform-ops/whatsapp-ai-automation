'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, ChevronDown, ChevronUp, Send, Eye, EyeOff, CornerDownRight } from 'lucide-react';
import { metaApi } from '@/lib/pixie-lab/servicesClient';
import type { MetaInboxItem, MetaSentiment } from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, OfflineState, ErrorState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';

const ACCENT = '#EC4899';

const SENTIMENT_COLOR: Record<MetaSentiment | string, string> = {
  positive: '#22c55e',
  neutral: '#64748b',
  negative: '#f97316',
  angry: '#ef4444',
  spam: '#94a3b8',
};

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b',
  replied: '#22c55e',
  hidden: '#94a3b8',
  routed: '#3b82f6',
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

interface ItemCardProps {
  item: MetaInboxItem;
  type: 'dm' | 'comment';
  onAction: (item: MetaInboxItem) => void;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  result: ActionResult | null;
}

interface ActionResult {
  type: 'analysis' | 'reply-queued' | 'routed' | 'hidden' | 'error';
  message?: string;
  analysis?: unknown;
  approval_id?: string;
}

function ItemCard({ item, type, onAction, busy, expanded, onToggle, result }: ItemCardProps) {
  const sentiment = item.sentiment || 'neutral';
  const sentColor = SENTIMENT_COLOR[sentiment] || '#64748b';
  const statusColor = STATUS_COLOR[item.status || ''] || '#64748b';

  return (
    <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-full text-[12px] font-bold text-white"
          style={{ background: sentColor }}
        >
          {(item.sender_name || '?')[0].toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-display text-[14px] font-bold text-[var(--pl-text)]">
              {item.sender_name || 'Unknown sender'}
            </span>
            {item.status && <Badge color={statusColor}>{item.status}</Badge>}
            <Badge color={sentColor}>{sentiment}</Badge>
            {item.intent && (
              <span className="text-[10.5px] text-[var(--pl-text-muted)]">· {item.intent}</span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-[13px] text-[var(--pl-text-muted)]">{item.message_text}</p>
          {item.created_at && (
            <p className="mt-0.5 text-[11.5px] text-[var(--pl-text-muted)]">
              {new Date(item.created_at).toLocaleString()}
            </p>
          )}
        </div>
        <button
          onClick={onToggle}
          className="flex-none rounded-lg border border-[var(--pl-border)] p-1.5 text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)]"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && <ItemActions item={item} type={type} onAction={onAction} busy={busy} result={result} />}
    </div>
  );
}

function ItemActions({
  item, type, onAction, busy, result,
}: {
  item: MetaInboxItem;
  type: 'dm' | 'comment';
  onAction: (item: MetaInboxItem) => void;
  busy: boolean;
  result: ActionResult | null;
}) {
  const [replyText, setReplyText] = useState('');
  const [localBusy, setLocalBusy] = useState<string | null>(null);

  async function doAction(action: 'analyze' | 'prepare-reply' | 'route' | 'hide', reply?: string) {
    setLocalBusy(action);
    await metaApi.inboxAction(action, item.id, reply);
    setLocalBusy(null);
    onAction(item);
  }

  return (
    <div className="mt-4 space-y-3 border-t border-[var(--pl-border)] pt-3">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => doAction('analyze')}
          disabled={busy || localBusy !== null}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)] disabled:opacity-50"
        >
          {localBusy === 'analyze' ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
          Analyze
        </button>
        <button
          onClick={() => doAction('route')}
          disabled={busy || localBusy !== null}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)] disabled:opacity-50"
        >
          {localBusy === 'route' ? <Loader2 size={13} className="animate-spin" /> : <CornerDownRight size={13} />}
          Route to receptionist
        </button>
        <button
          onClick={() => doAction('hide')}
          disabled={busy || localBusy !== null}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)] disabled:opacity-50"
        >
          {localBusy === 'hide' ? <Loader2 size={13} className="animate-spin" /> : <EyeOff size={13} />}
          Hide
        </button>
      </div>

      {/* Prepare reply */}
      <div>
        <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">
          {type === 'dm' ? 'Prepare DM reply' : 'Prepare comment reply'}
        </p>
        <div className="flex gap-2">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={`Draft a reply to ${item.sender_name || 'this sender'}…`}
            rows={2}
            className="flex-1 resize-none rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[13px] text-[var(--pl-text)] placeholder-[var(--pl-text-muted)] outline-none focus:border-[var(--pl-border-strong)]"
          />
          <button
            onClick={() => doAction('prepare-reply', replyText)}
            disabled={busy || localBusy !== null || !replyText.trim()}
            className="inline-flex items-center gap-1.5 self-end rounded-xl px-3 py-2 text-[13px] font-bold text-white disabled:opacity-50"
            style={{ background: ACCENT }}
          >
            {localBusy === 'prepare-reply' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>

      {/* Result feedback */}
      {result && (
        <div
          className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[12.5px] text-[var(--pl-text-soft)]"
        >
          {result.type === 'reply-queued' && (
            <>Reply queued for approval — check the{' '}
              <a href="/pixie-lab/marketing/approvals" className="font-semibold" style={{ color: ACCENT }}>Approvals</a> tab.</>
          )}
          {result.type === 'routed' && 'Routed to the receptionist agent.'}
          {result.type === 'hidden' && 'Item hidden.'}
          {result.type === 'analysis' && 'Analysis complete — refresh to see updated intent/sentiment.'}
          {result.type === 'error' && (result.message || 'Action failed — try again.')}
        </div>
      )}
    </div>
  );
}

interface InboxPanelProps {
  type: 'dm' | 'comment';
}

/**
 * InboxPanel — shared component for DM inbox and Comments tab. Pass type='dm'
 * or type='comment' to filter the meta inbox query accordingly.
 */
export function InboxPanel({ type }: InboxPanelProps) {
  const [loadStatus, setLoadStatus] = useState<'loading' | 'done' | 'offline' | 'error'>('loading');
  const [items, setItems] = useState<MetaInboxItem[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionResults, setActionResults] = useState<Record<string, ActionResult>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadStatus('loading');
    metaApi.inbox(type).then((d) => {
      if (!d.backendUp) { setLoadStatus('offline'); return; }
      if (d.error) { setLoadStatus('error'); return; }
      setItems(Array.isArray(d.inbox) ? d.inbox : []);
      setLoadStatus('done');
    });
  }, [type]);

  useEffect(() => { load(); }, [load]);

  function handleAction(item: MetaInboxItem) {
    setBusyId(null);
    // Optimistically mark as processed and record a result to show feedback
    setActionResults((prev) => ({ ...prev, [item.id]: { type: 'analysis' } }));
    load();
  }

  const label = type === 'dm' ? 'DM' : 'comment';

  if (loadStatus === 'loading') return <div className="mt-6"><LoadingCards count={4} height="h-20" /></div>;
  if (loadStatus === 'offline') return <div className="mt-6"><OfflineState service="Marketing" action={<button onClick={load} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} /></div>;
  if (loadStatus === 'error') return <div className="mt-6"><ErrorState title={`Couldn't load ${label}s`} body="The marketing service returned an error." action={<button onClick={load} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} /></div>;
  if (items.length === 0) return (
    <div className="mt-6">
      <EmptyState
        title={`No ${label}s yet`}
        body={`When you receive ${type === 'dm' ? 'direct messages' : 'comments'} on your connected accounts, they'll appear here.`}
      />
    </div>
  );

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[var(--pl-text-muted)]">{items.length} {label}{items.length === 1 ? '' : 's'}</p>
        <button
          onClick={load}
          className="text-[12.5px] font-semibold transition"
          style={{ color: ACCENT }}
        >
          Refresh
        </button>
      </div>
      {items.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          type={type}
          onAction={handleAction}
          busy={busyId === item.id}
          expanded={expanded === item.id}
          onToggle={() => setExpanded((prev) => (prev === item.id ? null : item.id))}
          result={actionResults[item.id] ?? null}
        />
      ))}
    </div>
  );
}
