'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Check, X, Loader2 } from 'lucide-react';
import { AGENT_META, type FeedAgent } from '@/lib/pixie-lab/feed';

interface Approval {
  id: string;
  agent: string;
  title: string;
  action_type: string;
  status: string;
}

/**
 * ApprovalsView — risky actions waiting for an explicit yes/no. Lists pending
 * items from the engine and resolves them (approve → executed, reject). No
 * action ever auto-executes; this is the human gate.
 */
export function ApprovalsView({ tenant = 'demo' }: { tenant?: string }) {
  const [items, setItems] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/lab/approvals?tenant_id=${encodeURIComponent(tenant)}`, { cache: 'no-store' });
      const d = await r.json();
      setItems(Array.isArray(d.items) ? d.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => { load(); }, [load]);

  async function resolve(id: string, decision: 'approve' | 'reject') {
    setBusy(id);
    try {
      await fetch('/api/lab/approvals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenant, id, decision }),
      });
      setItems((xs) => xs.filter((x) => x.id !== id));
    } catch { /* ignore */ } finally { setBusy(null); }
  }

  const pending = items.filter((i) => i.status === 'pending');

  return (
    <main className="mx-auto max-w-3xl px-5 py-9 sm:px-8">
      <div className="flex items-center gap-2.5">
        <ShieldCheck size={22} className="text-[var(--pl-green)]" />
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Approvals</h1>
      </div>
      <p className="mt-1.5 text-[14px] text-[var(--pl-text-muted)]">Risky actions wait here for your explicit go-ahead. Nothing runs until you approve it.</p>

      <div className="mt-7 space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)]" />)
        ) : pending.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--pl-border)] bg-[var(--pl-surface)] py-16 text-center">
            <p className="font-display text-lg font-bold text-[var(--pl-text)]">Nothing to approve ✨</p>
            <p className="mt-1 text-sm text-[var(--pl-text-muted)]">Approve a risky card in your feed and it’ll appear here.</p>
          </div>
        ) : (
          <AnimatePresence>
            {pending.map((it) => (
              <motion.div
                key={it.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className="flex items-center gap-4 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--pl-text-muted)]">
                      {AGENT_META[it.agent as FeedAgent]?.label ?? it.agent}
                    </span>
                    <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10.5px] font-semibold text-amber-200">{it.action_type}</span>
                  </div>
                  <p className="mt-1.5 truncate font-display text-[15px] font-bold text-[var(--pl-text)]">{it.title}</p>
                </div>
                <button onClick={() => resolve(it.id, 'reject')} disabled={busy === it.id} className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)] disabled:opacity-50">
                  <X size={16} />
                </button>
                <button onClick={() => resolve(it.id, 'approve')} disabled={busy === it.id} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--pl-green)] px-3.5 py-2 text-[13px] font-bold text-[#02070a] disabled:opacity-50">
                  {busy === it.id ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Approve
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </main>
  );
}
