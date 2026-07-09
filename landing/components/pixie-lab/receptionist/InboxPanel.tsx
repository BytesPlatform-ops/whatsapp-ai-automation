'use client';

/**
 * Receptionist inbox — a searchable list of conversations on the left and the
 * selected thread's AI summary, transcript, and escalate control on the right.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Loader2, Search, Bot, User, ArrowUpRight, Check, MessageSquare } from 'lucide-react';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';
import type { RcpConversation, RcpConversationDetail } from '@/lib/pixie-lab/serviceTypes';
import {
  RCP_ACCENT, Card, Pill, StatusPill, TextInput, GhostButton, fmtDate, statusColor,
} from './widgets';
import { EmptyState, OfflineState, ErrorState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';

type ListStatus = 'loading' | 'ready' | 'offline' | 'error';

function SentimentDot({ sentiment }: { sentiment?: string }) {
  return <span className="inline-block h-2 w-2 flex-none rounded-full" style={{ background: statusColor(sentiment) }} title={sentiment || 'unknown'} />;
}

function isCustomer(role?: string) {
  const r = (role || '').toLowerCase();
  return r === 'assistant' || r === 'bot' || r === 'receptionist' || r === 'ai' ? false : true;
}

export function InboxPanel() {
  const [status, setStatus] = useState<ListStatus>('loading');
  const [conversations, setConversations] = useState<RcpConversation[]>([]);
  const [query, setQuery] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RcpConversationDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const [escalating, setEscalating] = useState(false);
  const [escalated, setEscalated] = useState(false);

  const loadList = useCallback(async () => {
    setStatus('loading');
    const d = await receptionistApi.getConversations();
    if (!d.backendUp) { setStatus('offline'); return; }
    if (d.error) { setStatus('error'); return; }
    setConversations(d.conversations || []);
    setStatus('ready');
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailStatus('loading');
    setDetail(null);
    setEscalated(false);
    const d = await receptionistApi.getConversation(id);
    if (!d.backendUp || d.error || !d.conversation) { setDetailStatus('error'); return; }
    setDetail(d as RcpConversationDetail);
    setDetailStatus('ready');
  }, []);

  function select(id: string) {
    setSelectedId(id);
    loadDetail(id);
  }

  async function escalate() {
    if (!selectedId || escalating) return;
    setEscalating(true);
    const d = await receptionistApi.escalateConversation(selectedId);
    setEscalating(false);
    if (d.backendUp && !d.error) {
      setEscalated(true);
      loadDetail(selectedId);
      loadList();
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) =>
      [c.summary, c.last_intent, c.channel, c.subject].some((f) => (f || '').toLowerCase().includes(q)),
    );
  }, [conversations, query]);

  return (
    <div className="mt-6">
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* ---------------- Left: list ---------------- */}
        <Card className="flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b border-[var(--pl-border)] p-3">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 focus-within:border-[var(--pl-border-strong)]">
              <Search size={14} className="text-[var(--pl-text-muted)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations…"
                className="flex-1 bg-transparent text-[13px] text-[var(--pl-text)] placeholder-[var(--pl-text-muted)] outline-none"
              />
            </div>
            <GhostButton onClick={loadList} disabled={status === 'loading'} aria-label="Refresh">
              <RefreshCw size={13} className={status === 'loading' ? 'animate-spin' : ''} />
            </GhostButton>
          </div>

          <div className="max-h-[560px] overflow-y-auto p-2">
            {status === 'loading' && <div className="p-1"><LoadingCards count={4} height="h-20" /></div>}
            {status === 'offline' && <div className="p-2"><OfflineState service="receptionist" action={<button onClick={loadList} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} /></div>}
            {status === 'error' && <div className="p-2"><ErrorState title="Couldn't load conversations" action={<button onClick={loadList} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} /></div>}
            {status === 'ready' && filtered.length === 0 && (
              <div className="p-2">
                <EmptyState
                  title={conversations.length === 0 ? 'No conversations yet' : 'No matches'}
                  body={conversations.length === 0 ? 'Conversations appear here as customers message the receptionist. Try the Live Console.' : 'Nothing matches your search. Clear it to see all threads.'}
                />
              </div>
            )}
            {status === 'ready' && filtered.length > 0 && (
              <ul className="space-y-1.5">
                {filtered.map((c) => {
                  const active = c.id === selectedId;
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => select(c.id)}
                        className="w-full rounded-xl border p-3 text-left transition"
                        style={active
                          ? { borderColor: RCP_ACCENT, background: `color-mix(in srgb, ${RCP_ACCENT} 8%, transparent)` }
                          : { borderColor: 'var(--pl-border)', background: 'var(--pl-surface)' }}
                      >
                        <div className="flex items-center gap-1.5">
                          {c.channel && <Pill>{c.channel.replace(/_/g, ' ')}</Pill>}
                          {c.last_intent && <Pill color={RCP_ACCENT}>{c.last_intent.replace(/_/g, ' ')}</Pill>}
                          <span className="ml-auto flex items-center gap-1"><SentimentDot sentiment={c.sentiment} /></span>
                        </div>
                        {c.summary && <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-snug text-[var(--pl-text-soft)]">{c.summary}</p>}
                        <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-[var(--pl-text-muted)]">
                          {c.status && <StatusPill status={c.status} />}
                          <span className="inline-flex items-center gap-0.5"><MessageSquare size={10} /> {c.message_count ?? 0}</span>
                          <span className="ml-auto">{fmtDate(c.updated_at)}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>

        {/* ---------------- Right: detail ---------------- */}
        <Card className="min-h-[320px] p-5">
          {!selectedId && (
            <EmptyState title="Select a conversation" body="Pick a thread on the left to read its AI summary, the full transcript, and escalate it to a human if needed." />
          )}

          {selectedId && detailStatus === 'loading' && (
            <div className="grid h-full place-items-center py-16">
              <Loader2 size={22} className="animate-spin" style={{ color: RCP_ACCENT }} />
            </div>
          )}

          {selectedId && detailStatus === 'error' && (
            <ErrorState title="Couldn't load this conversation" action={<button onClick={() => selectedId && loadDetail(selectedId)} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} />
          )}

          {selectedId && detailStatus === 'ready' && detail && (
            <div className="flex h-full flex-col">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {detail.conversation.channel && <Pill>{detail.conversation.channel.replace(/_/g, ' ')}</Pill>}
                    {detail.conversation.status && <StatusPill status={detail.conversation.status} />}
                    {detail.conversation.sentiment && <Pill color={statusColor(detail.conversation.sentiment)}>{detail.conversation.sentiment}</Pill>}
                  </div>
                  {detail.conversation.subject && (
                    <p className="mt-2 font-display text-[15px] font-extrabold tracking-tight text-[var(--pl-text)]">{detail.conversation.subject}</p>
                  )}
                </div>
                <div className="flex flex-none flex-col items-end gap-1.5">
                  {escalated ? (
                    <Pill color={statusColor('confirmed')}><Check size={11} /> Escalated to human</Pill>
                  ) : (
                    <GhostButton onClick={escalate} disabled={escalating}>
                      {escalating ? <Loader2 size={13} className="animate-spin" /> : <ArrowUpRight size={13} style={{ color: '#f97316' }} />}
                      Escalate to human
                    </GhostButton>
                  )}
                </div>
              </div>

              {detail.conversation.summary && (
                <div className="mt-3 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">AI summary</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-[var(--pl-text-soft)]">{detail.conversation.summary}</p>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {detail.conversation.last_intent && <Pill>intent: {detail.conversation.last_intent.replace(/_/g, ' ')}</Pill>}
                {detail.conversation.last_action && <Pill color={RCP_ACCENT}>action: {detail.conversation.last_action.replace(/_/g, ' ')}</Pill>}
              </div>

              <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1" style={{ maxHeight: 440 }}>
                {detail.messages.length === 0 ? (
                  <p className="py-6 text-center text-[13px] text-[var(--pl-text-muted)]">No messages in this thread yet.</p>
                ) : (
                  detail.messages.map((m) => {
                    const customer = isCustomer(m.role);
                    return (
                      <div key={m.id} className={`flex ${customer ? 'justify-end' : 'justify-start'}`}>
                        <div className={`flex max-w-[82%] items-end gap-2 ${customer ? 'flex-row-reverse' : ''}`}>
                          <span
                            className="grid h-7 w-7 flex-none place-items-center rounded-full"
                            style={customer
                              ? { background: 'var(--pl-surface-soft)', color: 'var(--pl-text-muted)' }
                              : { background: `color-mix(in srgb, ${RCP_ACCENT} 18%, transparent)`, color: RCP_ACCENT }}
                          >
                            {customer ? <User size={14} /> : <Bot size={14} />}
                          </span>
                          <div>
                            <div
                              className="rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed text-[var(--pl-text)]"
                              style={customer
                                ? { background: 'var(--pl-surface-soft)', border: '1px solid var(--pl-border)', borderTopRightRadius: 4 }
                                : { background: `color-mix(in srgb, ${RCP_ACCENT} 12%, transparent)`, borderTopLeftRadius: 4 }}
                            >
                              <p className="whitespace-pre-wrap break-words">{m.text}</p>
                            </div>
                            <div className={`mt-1 flex items-center gap-1.5 text-[10.5px] text-[var(--pl-text-muted)] ${customer ? 'justify-end' : ''}`}>
                              <span>{fmtDate(m.created_at)}</span>
                              {m.intent && <span>· {m.intent.replace(/_/g, ' ')}</span>}
                              {m.degraded && <span>· demo</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
