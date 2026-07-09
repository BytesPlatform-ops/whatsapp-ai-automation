'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw, CalendarCheck, FileText, ListTodo, LifeBuoy, CreditCard, Megaphone,
  CalendarDays, ExternalLink, Check, X, Plus, AlertTriangle, Send,
} from 'lucide-react';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';
import type {
  RcpBooking, RcpQuote, RcpTask, RcpTicket, RcpEscalation, RcpPayment,
  RcpCampaign, RcpCampaignReply, RcpRunResult,
} from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { Card, Pill, StatusPill, Field, TextInput, TextArea, PrimaryButton, GhostButton, fmtDate, statusColor, RCP_ACCENT } from './widgets';

type SubTab = 'bookings' | 'quotes' | 'tasks' | 'support' | 'payments' | 'campaigns';
type LoadState = 'idle' | 'loading' | 'offline' | 'ready';

const SUBTABS: { key: SubTab; label: string; icon: typeof CalendarCheck }[] = [
  { key: 'bookings', label: 'Bookings', icon: CalendarCheck },
  { key: 'quotes', label: 'Quotes', icon: FileText },
  { key: 'tasks', label: 'Work queue', icon: ListTodo },
  { key: 'support', label: 'Support', icon: LifeBuoy },
  { key: 'payments', label: 'Payments', icon: CreditCard },
  { key: 'campaigns', label: 'Campaigns', icon: Megaphone },
];

function Row({ children }: { children: React.ReactNode }) {
  return <Card className="p-3.5">{children}</Card>;
}

function OfflineBlock({ onRetry }: { onRetry: () => void }) {
  return <OfflineState service="receptionist" action={<GhostButton onClick={onRetry}><RefreshCw size={13} /> Retry</GhostButton>} />;
}

/* ------------------------------ Bookings ------------------------------ */

function BookingsTab() {
  const [state, setState] = useState<LoadState>('loading');
  const [bookings, setBookings] = useState<RcpBooking[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', service_type: '', date: '', time: '' });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    const d = await receptionistApi.getBookings();
    if (!d.backendUp) return setState('offline');
    setBookings(Array.isArray(d.bookings) ? d.bookings : []);
    setState('ready');
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(id: string, kind: 'confirm' | 'cancel') {
    setBusyId(id);
    if (kind === 'confirm') await receptionistApi.confirmBooking(id);
    else await receptionistApi.cancelBooking(id);
    setBusyId(null);
    await load();
  }

  async function create() {
    if (!form.name.trim()) return;
    setCreating(true);
    await receptionistApi.createBooking({ ...form });
    setCreating(false);
    setForm({ name: '', service_type: '', date: '', time: '' });
    await load();
  }

  if (state === 'loading') return <LoadingCards count={3} height="h-20" />;
  if (state === 'offline') return <OfflineBlock onRetry={() => void load()} />;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">New booking</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Name"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Customer" /></Field>
          <Field label="Service"><TextInput value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value })} placeholder="Consultation" /></Field>
          <Field label="Date"><TextInput type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Time"><TextInput type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></Field>
        </div>
        <div className="mt-3">
          <PrimaryButton onClick={() => void create()} disabled={creating || !form.name.trim()}><Plus size={14} /> Add booking</PrimaryButton>
        </div>
      </Card>

      {bookings.length === 0 ? (
        <EmptyState title="No bookings yet" body="Appointments booked by the receptionist will show up here." />
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <Row key={b.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-display text-[14px] font-bold text-[var(--pl-text)]">{b.name || 'Unnamed'}</p>
                    <StatusPill status={b.status} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-[var(--pl-text-muted)]">
                    {b.service_type && <Pill color={RCP_ACCENT}>{b.service_type}</Pill>}
                    {(b.date || b.time) && <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> {[b.date, b.time].filter(Boolean).join(' ')}{b.timezone ? ` (${b.timezone})` : ''}</span>}
                    {b.phone && <span>{b.phone}</span>}
                    {b.email && <span>{b.email}</span>}
                  </div>
                  {b.calendar_html_link && (
                    <a href={b.calendar_html_link} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: RCP_ACCENT }}>
                      <ExternalLink size={12} /> Calendar event
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <GhostButton onClick={() => void act(b.id, 'confirm')} disabled={busyId === b.id}><Check size={12} /> Confirm</GhostButton>
                  <GhostButton onClick={() => void act(b.id, 'cancel')} disabled={busyId === b.id}><X size={12} /> Cancel</GhostButton>
                </div>
              </div>
            </Row>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Quotes ------------------------------ */

const QUOTE_STATUSES = ['new', 'preparing', 'sent', 'accepted', 'declined', 'closed'];

function QuotesTab() {
  const [state, setState] = useState<LoadState>('loading');
  const [quotes, setQuotes] = useState<RcpQuote[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    const d = await receptionistApi.getQuotes();
    if (!d.backendUp) return setState('offline');
    setQuotes(Array.isArray(d.quotes) ? d.quotes : []);
    setState('ready');
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function setStatusOf(id: string, newStatus: string) {
    setBusyId(id);
    await receptionistApi.updateQuote(id, { status: newStatus });
    setBusyId(null);
    await load();
  }

  if (state === 'loading') return <LoadingCards count={3} height="h-20" />;
  if (state === 'offline') return <OfflineBlock onRetry={() => void load()} />;
  if (quotes.length === 0) return <EmptyState title="No quotes yet" body="Estimates the receptionist prepares will be listed here." />;

  return (
    <div className="space-y-3">
      {quotes.map((q) => {
        const range = q.estimated_min != null || q.estimated_max != null
          ? `${q.currency || ''} ${q.estimated_min ?? '?'}–${q.estimated_max ?? '?'}`.trim()
          : null;
        return (
          <Row key={q.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-display text-[14px] font-bold text-[var(--pl-text)]">{q.service || q.name || 'Quote'}</p>
                  <StatusPill status={q.status} />
                </div>
                {q.scope && <p className="mt-1 text-[13px] text-[var(--pl-text-soft)]">{q.scope}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-[var(--pl-text-muted)]">
                  {q.budget && <span>Budget: {q.budget}</span>}
                  {q.timeline && <span>Timeline: {q.timeline}</span>}
                  {q.quantity && <span>Qty: {q.quantity}</span>}
                  {q.location && <span>{q.location}</span>}
                  {range && <Pill color={RCP_ACCENT}>Est. {range}</Pill>}
                </div>
              </div>
              <label className="shrink-0">
                <span className="sr-only">Set status</span>
                <select
                  value={q.status || 'new'}
                  onChange={(e) => void setStatusOf(q.id, e.target.value)}
                  disabled={busyId === q.id}
                  className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-1.5 text-[12.5px] font-semibold capitalize text-[var(--pl-text-soft)] outline-none disabled:opacity-50"
                >
                  {QUOTE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>
          </Row>
        );
      })}
    </div>
  );
}

/* ------------------------------ Work queue ------------------------------ */

type Bucket = 'Overdue' | 'Today' | 'Upcoming' | 'No date';

function bucketFor(due_at?: string): Bucket {
  if (!due_at) return 'No date';
  const d = new Date(due_at);
  if (isNaN(d.getTime())) return 'No date';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (d.getTime() < now.getTime() && dueDay.getTime() < today.getTime()) return 'Overdue';
  if (dueDay.getTime() === today.getTime()) return 'Today';
  if (dueDay.getTime() < today.getTime()) return 'Overdue';
  return 'Upcoming';
}

const BUCKET_ORDER: Bucket[] = ['Overdue', 'Today', 'Upcoming', 'No date'];
const BUCKET_COLOR: Record<Bucket, string> = { Overdue: '#ef4444', Today: '#f59e0b', Upcoming: '#3b82f6', 'No date': '#64748b' };

function TasksTab() {
  const [state, setState] = useState<LoadState>('loading');
  const [tasks, setTasks] = useState<RcpTask[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    const d = await receptionistApi.getTasks();
    if (!d.backendUp) return setState('offline');
    setTasks(Array.isArray(d.tasks) ? d.tasks : []);
    setState('ready');
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function complete(id: string) {
    setBusyId(id);
    await receptionistApi.completeTask(id);
    setBusyId(null);
    await load();
  }

  if (state === 'loading') return <LoadingCards count={3} height="h-16" />;
  if (state === 'offline') return <OfflineBlock onRetry={() => void load()} />;
  if (tasks.length === 0) return <EmptyState title="Work queue is clear" body="Follow-ups and tasks the receptionist creates will queue up here." />;

  const grouped: Record<Bucket, RcpTask[]> = { Overdue: [], Today: [], Upcoming: [], 'No date': [] };
  for (const t of tasks) grouped[bucketFor(t.due_at)].push(t);

  return (
    <div className="space-y-5">
      {BUCKET_ORDER.filter((b) => grouped[b].length > 0).map((bucket) => (
        <div key={bucket}>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: BUCKET_COLOR[bucket] }} />
            <span className="text-[12.5px] font-bold text-[var(--pl-text)]">{bucket}</span>
            <span className="text-[11.5px] text-[var(--pl-text-muted)]">{grouped[bucket].length}</span>
          </div>
          <div className="space-y-2.5">
            {grouped[bucket].map((t) => (
              <Row key={t.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {t.kind && <Pill color="#8b5cf6">{t.kind}</Pill>}
                      <p className="font-display text-[13.5px] font-bold text-[var(--pl-text)]">{t.title || 'Untitled task'}</p>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-[var(--pl-text-muted)]">
                      {t.related_type && <span>{t.related_type}{t.related_id ? ` · ${t.related_id}` : ''}</span>}
                      {t.due_at && <span>Due {fmtDate(t.due_at)}</span>}
                      {t.owner && <span>Owner: {t.owner}</span>}
                    </div>
                  </div>
                  <GhostButton onClick={() => void complete(t.id)} disabled={busyId === t.id}><Check size={12} /> Complete</GhostButton>
                </div>
              </Row>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Support ------------------------------ */

function SupportTab() {
  const [state, setState] = useState<LoadState>('loading');
  const [tickets, setTickets] = useState<RcpTicket[]>([]);
  const [escalations, setEscalations] = useState<RcpEscalation[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    const [t, e] = await Promise.all([receptionistApi.getTickets(), receptionistApi.getEscalations()]);
    if (!t.backendUp) return setState('offline');
    setTickets(Array.isArray(t.tickets) ? t.tickets : []);
    setEscalations(Array.isArray(e.escalations) ? e.escalations : []);
    setState('ready');
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function resolve(id: string, newStatus: string) {
    setBusyId(id);
    await receptionistApi.updateTicket(id, { status: newStatus });
    setBusyId(null);
    await load();
  }

  if (state === 'loading') return <LoadingCards count={3} height="h-20" />;
  if (state === 'offline') return <OfflineBlock onRetry={() => void load()} />;
  if (tickets.length === 0 && escalations.length === 0) {
    return <EmptyState title="No support items" body="Tickets and human escalations raised by the receptionist appear here." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">Tickets</p>
        {tickets.length === 0 ? (
          <p className="text-[13px] text-[var(--pl-text-muted)]">No open tickets.</p>
        ) : (
          <div className="space-y-3">
            {tickets.map((t) => (
              <Row key={t.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {t.priority && <Pill color={statusColor(t.priority)}>{t.priority}</Pill>}
                      {t.sentiment && <Pill color={statusColor(t.sentiment)}>{t.sentiment}</Pill>}
                      <StatusPill status={t.status} />
                    </div>
                    <p className="mt-1.5 font-display text-[14px] font-bold text-[var(--pl-text)]">{t.subject || t.kind || 'Ticket'}</p>
                    {t.body && <p className="mt-0.5 text-[13px] text-[var(--pl-text-soft)]">{t.body}</p>}
                    {t.assigned_to && <p className="mt-1 text-[12px] text-[var(--pl-text-muted)]">Assigned to {t.assigned_to}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <GhostButton onClick={() => void resolve(t.id, 'resolved')} disabled={busyId === t.id}><Check size={12} /> Resolve</GhostButton>
                    <GhostButton onClick={() => void resolve(t.id, 'closed')} disabled={busyId === t.id}><X size={12} /> Close</GhostButton>
                  </div>
                </div>
              </Row>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">Escalations</p>
        {escalations.length === 0 ? (
          <p className="text-[13px] text-[var(--pl-text-muted)]">No escalations.</p>
        ) : (
          <div className="space-y-3">
            {escalations.map((e) => (
              <Row key={e.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <AlertTriangle size={14} style={{ color: statusColor(e.priority) }} />
                      {e.priority && <Pill color={statusColor(e.priority)}>{e.priority}</Pill>}
                      <StatusPill status={e.status} />
                    </div>
                    <p className="mt-1.5 text-[13.5px] font-semibold text-[var(--pl-text)]">{e.reason || 'Escalation'}</p>
                    {e.context && <p className="mt-0.5 text-[12.5px] text-[var(--pl-text-soft)]">{e.context}</p>}
                    {(e.notified || []).length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-[var(--pl-text-muted)]">Notified:</span>
                        {(e.notified || []).map((n) => (
                          <span key={n} className="rounded-md bg-[var(--pl-surface-soft)] px-1.5 py-0.5 text-[10.5px] text-[var(--pl-text-soft)]">{n}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {e.created_at && <span className="shrink-0 text-[11.5px] text-[var(--pl-text-muted)]">{fmtDate(e.created_at)}</span>}
                </div>
              </Row>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Payments ------------------------------ */

function PaymentsTab() {
  const [state, setState] = useState<LoadState>('loading');
  const [payments, setPayments] = useState<RcpPayment[]>([]);
  const [form, setForm] = useState({ amount: '', currency: 'USD', description: '', email: '' });
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<RcpPayment | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    const d = await receptionistApi.getPayments();
    if (!d.backendUp) return setState('offline');
    setPayments(Array.isArray(d.payments) ? d.payments : []);
    setState('ready');
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    const amount = Number(form.amount);
    if (!amount || isNaN(amount) || amount <= 0) return;
    setCreating(true);
    setCreated(null);
    const d = await receptionistApi.createPaymentLink({
      amount,
      currency: form.currency || 'USD',
      description: form.description || undefined,
      email: form.email || undefined,
    });
    setCreating(false);
    if (d.payment) setCreated(d.payment);
    setForm({ amount: '', currency: 'USD', description: '', email: '' });
    await load();
  }

  if (state === 'loading') return <LoadingCards count={3} height="h-20" />;
  if (state === 'offline') return <OfflineBlock onRetry={() => void load()} />;

  const renderPayment = (p: RcpPayment) => (
    <Row key={p.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-display text-[15px] font-extrabold text-[var(--pl-text)]">
              {p.amount != null ? `${p.currency || 'USD'} ${p.amount}` : '—'}
            </p>
            <StatusPill status={p.status} />
          </div>
          {p.description && <p className="mt-0.5 text-[13px] text-[var(--pl-text-soft)]">{p.description}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[12px] text-[var(--pl-text-muted)]">
            {p.name && <span>{p.name}</span>}
            {p.email && <span>{p.email}</span>}
            {p.provider && <span>via {p.provider}</span>}
          </div>
          {p.payment_link ? (
            <a href={p.payment_link} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-semibold" style={{ color: RCP_ACCENT }}>
              <ExternalLink size={12} /> Open payment link
            </a>
          ) : (
            <p className="mt-1.5 text-[11.5px] text-[var(--pl-text-muted)]">Pending — no Stripe link (provider not connected).</p>
          )}
        </div>
      </div>
    </Row>
  );

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">Create payment link</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Amount"><TextInput type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="100" /></Field>
          <Field label="Currency"><TextInput value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} placeholder="USD" /></Field>
          <Field label="Description"><TextInput value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Deposit" /></Field>
          <Field label="Email"><TextInput type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="customer@email.com" /></Field>
        </div>
        <div className="mt-3">
          <PrimaryButton onClick={() => void create()} disabled={creating || !form.amount}><Plus size={14} /> Create link</PrimaryButton>
        </div>
        {created && (
          <div className="mt-3 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold text-[var(--pl-text-soft)]">Result:</span>
              <StatusPill status={created.status} />
            </div>
            {created.payment_link ? (
              <a href={created.payment_link} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-semibold" style={{ color: RCP_ACCENT }}>
                <ExternalLink size={12} /> {created.payment_link}
              </a>
            ) : (
              <p className="mt-1 text-[12px] text-[var(--pl-text-muted)]">Recorded as pending — Stripe isn&apos;t connected, so no live link was generated.</p>
            )}
          </div>
        )}
      </Card>

      {payments.length === 0 ? (
        <EmptyState title="No payments yet" body="Payment links created by the receptionist will be listed here." />
      ) : (
        <div className="space-y-3">{payments.map(renderPayment)}</div>
      )}
    </div>
  );
}

/* ------------------------------ Campaigns ------------------------------ */

function CampaignsTab() {
  const [state, setState] = useState<LoadState>('loading');
  const [campaigns, setCampaigns] = useState<RcpCampaign[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, RcpCampaignReply[]>>({});
  const [repliesLoading, setRepliesLoading] = useState<string | null>(null);
  const [form, setForm] = useState({ campaign_id: '', message: '', email: '' });
  const [ingesting, setIngesting] = useState(false);
  const [result, setResult] = useState<RcpRunResult | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    const d = await receptionistApi.getCampaigns();
    if (!d.backendUp) return setState('offline');
    setCampaigns(Array.isArray(d.campaigns) ? d.campaigns : []);
    setState('ready');
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function toggleCampaign(id: string) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (!replies[id]) {
      setRepliesLoading(id);
      const d = await receptionistApi.getCampaignReplies(id);
      setRepliesLoading(null);
      setReplies((r) => ({ ...r, [id]: Array.isArray(d.replies) ? d.replies : [] }));
    }
  }

  async function ingest() {
    if (!form.message.trim()) return;
    setIngesting(true);
    setResult(null);
    const d = await receptionistApi.ingestCampaignReply({
      campaign_id: form.campaign_id || undefined,
      message: form.message,
      email: form.email || undefined,
    });
    setIngesting(false);
    if (d.backendUp) setResult(d);
    if (form.campaign_id && replies[form.campaign_id]) {
      const rd = await receptionistApi.getCampaignReplies(form.campaign_id);
      setReplies((r) => ({ ...r, [form.campaign_id]: Array.isArray(rd.replies) ? rd.replies : [] }));
    }
  }

  if (state === 'loading') return <LoadingCards count={3} height="h-16" />;
  if (state === 'offline') return <OfflineBlock onRetry={() => void load()} />;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">Ingest a test reply</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Campaign (optional)">
            <select
              value={form.campaign_id}
              onChange={(e) => setForm({ ...form, campaign_id: e.target.value })}
              className="w-full rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[14px] text-[var(--pl-text)] outline-none"
            >
              <option value="">— none —</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}
            </select>
          </Field>
          <Field label="Email (optional)"><TextInput type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="reply@email.com" /></Field>
        </div>
        <div className="mt-3">
          <Field label="Reply message"><TextArea rows={2} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="e.g. Yes, I'm interested — call me back" /></Field>
        </div>
        <div className="mt-3">
          <PrimaryButton onClick={() => void ingest()} disabled={ingesting || !form.message.trim()}><Send size={14} /> Ingest reply</PrimaryButton>
        </div>
        {result && (
          <div className="mt-3 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-semibold text-[var(--pl-text-soft)]">Classification:</span>
              {result.intent && <Pill color="#8b5cf6">{result.intent}</Pill>}
              {result.action && <Pill color={RCP_ACCENT}>{result.action}</Pill>}
              {result.sentiment && <Pill color={statusColor(result.sentiment)}>{result.sentiment}</Pill>}
              {result.status && <StatusPill status={result.status} />}
            </div>
            {result.reply && <p className="mt-1.5 text-[13px] text-[var(--pl-text-soft)]">{result.reply}</p>}
          </div>
        )}
      </Card>

      {campaigns.length === 0 ? (
        <EmptyState title="No campaigns" body="Outreach campaigns will appear here once they're configured." />
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const isOpen = openId === c.id;
            const rows = replies[c.id] || [];
            return (
              <Card key={c.id} className="p-3.5">
                <button type="button" onClick={() => void toggleCampaign(c.id)} className="flex w-full flex-wrap items-center justify-between gap-3 text-left">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-[14px] font-bold text-[var(--pl-text)]">{c.name || 'Campaign'}</p>
                      {c.type && <Pill color="#3b82f6">{c.type}</Pill>}
                      <StatusPill status={c.status} />
                      {c.dry_run && <Pill color="#f59e0b">dry run</Pill>}
                    </div>
                    {(c.channels || []).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {(c.channels || []).map((ch) => (
                          <span key={ch} className="rounded-md bg-[var(--pl-surface-soft)] px-1.5 py-0.5 text-[10.5px] text-[var(--pl-text-muted)]">{ch}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-[12px] font-semibold" style={{ color: RCP_ACCENT }}>{isOpen ? 'Hide replies' : 'View replies'}</span>
                </button>

                {isOpen && (
                  <div className="mt-3 border-t border-[var(--pl-border)] pt-3">
                    {repliesLoading === c.id ? (
                      <LoadingCards count={2} height="h-12" />
                    ) : rows.length === 0 ? (
                      <p className="text-[13px] text-[var(--pl-text-muted)]">No replies for this campaign yet.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {rows.map((r) => (
                          <div key={r.id} className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              {r.classification && <Pill color="#8b5cf6">{r.classification}</Pill>}
                              {r.channel && <Pill color="#3b82f6">{r.channel}</Pill>}
                              {r.action_taken && <Pill color={RCP_ACCENT}>{r.action_taken}</Pill>}
                              {r.status && <StatusPill status={r.status} />}
                              {r.created_at && <span className="text-[11px] text-[var(--pl-text-muted)]">{fmtDate(r.created_at)}</span>}
                            </div>
                            {r.text && <p className="mt-1.5 text-[13px] text-[var(--pl-text-soft)]">{r.text}</p>}
                            {r.from_email && <p className="mt-0.5 text-[11.5px] text-[var(--pl-text-muted)]">{r.from_email}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Shell ------------------------------ */

export function OperationsPanel() {
  const [tab, setTab] = useState<SubTab>('bookings');

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        {SUBTABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition"
              style={active ? { background: `color-mix(in srgb, ${RCP_ACCENT} 16%, transparent)`, color: RCP_ACCENT } : { color: 'var(--pl-text-muted)' }}
            >
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        {tab === 'bookings' && <BookingsTab />}
        {tab === 'quotes' && <QuotesTab />}
        {tab === 'tasks' && <TasksTab />}
        {tab === 'support' && <SupportTab />}
        {tab === 'payments' && <PaymentsTab />}
        {tab === 'campaigns' && <CampaignsTab />}
      </div>
    </div>
  );
}
