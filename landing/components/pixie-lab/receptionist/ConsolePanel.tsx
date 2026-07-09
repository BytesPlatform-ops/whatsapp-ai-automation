'use client';

/**
 * Live test console for the AI Receptionist. Send a customer message and watch
 * the reply, detected intent, the action taken, and any record it creates — all
 * on one thread you can continue. This is the marquee "try it" surface.
 */

import { useRef, useState } from 'react';
import { Loader2, Send, RotateCcw, Bot, User, Sparkles, AlertTriangle, FileText, ChevronDown } from 'lucide-react';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';
import type { RcpRunResult } from '@/lib/pixie-lab/serviceTypes';
import {
  RCP_ACCENT, Card, Pill, StatusPill, Field, TextInput, TextArea,
  PrimaryButton, GhostButton, fmtDate, statusColor,
} from './widgets';
import { EmptyState } from '@/components/pixie-lab/services/ServiceStates';

type TranscriptMsg = { role: 'customer' | 'assistant'; text: string; at: string };

const CHANNELS = ['web_chat', 'whatsapp', 'instagram', 'gmail', 'sms', 'voice'] as const;

const selectCls =
  'w-full rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[14px] text-[var(--pl-text)] outline-none focus:border-[var(--pl-border-strong)]';

export function ConsolePanel() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [channel, setChannel] = useState<string>('web_chat');
  const [message, setMessage] = useState('');

  const [transcript, setTranscript] = useState<TranscriptMsg[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<RcpRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRecord, setShowRecord] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  async function run() {
    const msg = message.trim();
    if (!msg || running) return;
    setRunning(true);
    setError(null);

    const now = new Date().toISOString();
    setTranscript((t) => [...t, { role: 'customer', text: msg, at: now }]);
    setMessage('');

    const d = await receptionistApi.runMessage({
      message: msg,
      channel,
      conversation_id: conversationId,
      name: name.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      company: company.trim() || undefined,
    });

    if (!d.backendUp) {
      setError(d.error || 'The receptionist service is offline. Make sure the Pixie backend is running, then retry.');
      setRunning(false);
      return;
    }

    setResult(d as RcpRunResult);
    setShowRecord(false);
    if (d.conversation_id) setConversationId(d.conversation_id);
    if (d.reply) {
      setTranscript((t) => [...t, { role: 'assistant', text: d.reply as string, at: new Date().toISOString() }]);
    }
    setRunning(false);
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }

  function newConversation() {
    setTranscript([]);
    setConversationId(undefined);
    setResult(null);
    setError(null);
    setShowRecord(false);
  }

  return (
    <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
      {/* ---------------- Left: customer + composer ---------------- */}
      <Card className="p-5">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${RCP_ACCENT} 16%, transparent)`, color: RCP_ACCENT }}>
            <Sparkles size={16} />
          </span>
          <div>
            <p className="font-display text-[15px] font-extrabold tracking-tight text-[var(--pl-text)]">Live console</p>
            <p className="text-[12px] text-[var(--pl-text-muted)]">Send a message as a customer</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Name"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" /></Field>
          <Field label="Company"><TextInput value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Inc." /></Field>
          <Field label="Email"><TextInput value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@acme.com" type="email" /></Field>
          <Field label="Phone"><TextInput value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 0100" /></Field>
        </div>

        <div className="mt-3">
          <Field label="Channel">
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className={selectCls}>
              {CHANNELS.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
        </div>

        <div className="mt-3">
          <Field label="Customer message">
            <TextArea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(); }}
              placeholder="Type a customer message…  (⌘/Ctrl + Enter to send)"
              rows={4}
            />
          </Field>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <PrimaryButton onClick={run} disabled={running || message.trim().length === 0}>
            {running ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {running ? 'Running…' : 'Run Receptionist'}
          </PrimaryButton>
          <GhostButton onClick={newConversation} disabled={running}>
            <RotateCcw size={13} /> New conversation
          </GhostButton>
        </div>

        {conversationId && (
          <p className="mt-3 text-[11.5px] text-[var(--pl-text-muted)]">
            Continuing thread <span className="font-mono text-[var(--pl-text-soft)]">{conversationId.slice(0, 8)}</span>
          </p>
        )}
      </Card>

      {/* ---------------- Right: transcript + analysis ---------------- */}
      <div className="space-y-5">
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-[color:color-mix(in_srgb,#ef4444_40%,transparent)] bg-[color:color-mix(in_srgb,#ef4444_10%,transparent)] px-4 py-3 text-[13px] text-[var(--pl-text)]">
            <AlertTriangle size={15} className="mt-0.5 flex-none" style={{ color: '#ef4444' }} />
            <span>{error}</span>
          </div>
        )}

        <Card className="flex flex-col overflow-hidden">
          <div className="border-b border-[var(--pl-border)] px-4 py-3">
            <p className="font-display text-[14px] font-extrabold tracking-tight text-[var(--pl-text)]">Transcript</p>
          </div>
          {transcript.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="Try the receptionist"
                body="Send a customer message to see the reply, detected intent, the action taken, and any record it creates."
              />
            </div>
          ) : (
            <div ref={scrollRef} className="max-h-[440px] space-y-3 overflow-y-auto px-4 py-4">
              {transcript.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'customer' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`flex max-w-[82%] items-end gap-2 ${m.role === 'customer' ? 'flex-row-reverse' : ''}`}>
                    <span
                      className="grid h-7 w-7 flex-none place-items-center rounded-full"
                      style={m.role === 'assistant'
                        ? { background: `color-mix(in srgb, ${RCP_ACCENT} 18%, transparent)`, color: RCP_ACCENT }
                        : { background: 'var(--pl-surface-soft)', color: 'var(--pl-text-muted)' }}
                    >
                      {m.role === 'assistant' ? <Bot size={14} /> : <User size={14} />}
                    </span>
                    <div>
                      <div
                        className="rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed text-[var(--pl-text)]"
                        style={m.role === 'assistant'
                          ? { background: `color-mix(in srgb, ${RCP_ACCENT} 12%, transparent)`, borderTopLeftRadius: 4 }
                          : { background: 'var(--pl-surface-soft)', border: '1px solid var(--pl-border)', borderTopRightRadius: 4 }}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.text}</p>
                      </div>
                      <p className={`mt-1 text-[10.5px] text-[var(--pl-text-muted)] ${m.role === 'customer' ? 'text-right' : ''}`}>{fmtDate(m.at)}</p>
                    </div>
                  </div>
                </div>
              ))}
              {running && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl bg-[color:color-mix(in_srgb,var(--pl-accent,#E6B45A)_12%,transparent)] px-3.5 py-2 text-[13px] text-[var(--pl-text-muted)]">
                    <Loader2 size={13} className="animate-spin" style={{ color: RCP_ACCENT }} /> Thinking…
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        {result && (
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-[14px] font-extrabold tracking-tight text-[var(--pl-text)]">Analysis</p>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {result.degraded && <Pill color="#f59e0b">demo brain</Pill>}
                {result.escalated && <Pill color={statusColor('escalated')}>escalated</Pill>}
                {result.status && <StatusPill status={result.status} />}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {result.intent && <Pill>intent: {result.intent.replace(/_/g, ' ')}</Pill>}
              {result.action && <Pill color={RCP_ACCENT}>action: {result.action.replace(/_/g, ' ')}</Pill>}
              {typeof result.confidence === 'number' && (
                <Pill color={statusColor(result.confidence >= 0.66 ? 'positive' : result.confidence >= 0.33 ? 'pending' : 'negative')}>
                  {Math.round(result.confidence * 100)}% confidence
                </Pill>
              )}
              {result.sentiment && <Pill color={statusColor(result.sentiment)}>{result.sentiment}</Pill>}
            </div>

            {(result.llm_provider || result.model) && (
              <p className="mt-3 text-[11.5px] text-[var(--pl-text-muted)]">
                Brain: <span className="font-semibold text-[var(--pl-text-soft)]">{result.llm_provider || 'unknown'}</span>
                {result.model && <> · <span className="font-mono">{result.model}</span></>}
              </p>
            )}

            {result.record_type && result.record_id && (
              <div className="mt-3 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--pl-text-soft)]">
                    <FileText size={13} style={{ color: RCP_ACCENT }} />
                    Created {result.record_type.replace(/_/g, ' ')}
                  </span>
                  <span className="font-mono text-[11px] text-[var(--pl-text-muted)]">{result.record_id.slice(0, 12)}</span>
                </div>
                {result.record && (
                  <>
                    <button
                      onClick={() => setShowRecord((s) => !s)}
                      className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)]"
                    >
                      <ChevronDown size={12} className={`transition ${showRecord ? 'rotate-180' : ''}`} />
                      {showRecord ? 'Hide' : 'Show'} record
                    </button>
                    {showRecord && (
                      <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-[var(--pl-surface)] p-3 text-[11.5px] leading-relaxed text-[var(--pl-text-soft)]">
                        {JSON.stringify(result.record, null, 2)}
                      </pre>
                    )}
                  </>
                )}
              </div>
            )}

            {result.provider_status && Object.keys(result.provider_status).length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">Provider status</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(result.provider_status).map(([k, v]) => {
                    const label = typeof v === 'object' && v !== null ? String((v as Record<string, unknown>).status ?? (v as Record<string, unknown>).mode ?? 'ok') : String(v);
                    return <Pill key={k} color={statusColor(label)}>{k.replace(/_/g, ' ')}: {label}</Pill>;
                  })}
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
