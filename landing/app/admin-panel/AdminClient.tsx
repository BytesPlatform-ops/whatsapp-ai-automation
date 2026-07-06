'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Download, Loader2, RefreshCw, Search, Sparkles, Trash2, Users, X } from 'lucide-react';
import type { WaitlistRow } from '@/lib/waitlistStore';
import { SignOutButton } from './SignOutButton';
import { deleteLead } from './actions';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function Chip({ label, kind }: { label: string; kind: 'yes' | 'no' }) {
  const yes = kind === 'yes';
  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ' +
        (yes
          ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20'
          : 'bg-slate-500/10 text-slate-400 ring-1 ring-slate-400/15')
      }
    >
      {yes ? <Check className="h-3 w-3" strokeWidth={2.6} /> : <X className="h-3 w-3" strokeWidth={2.6} />}
      {label}
    </span>
  );
}

function toCsv(rows: WaitlistRow[]): string {
  const head = ['Date', 'Name', 'Business', 'Contact', 'Email', 'Interested', 'Selected', 'Rejected'];
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.created_at,
      r.name,
      r.business,
      r.contact,
      r.email,
      `${r.selected?.length ?? 0}/6`,
      (r.selected ?? []).join('; '),
      (r.rejected ?? []).join('; '),
    ]
      .map((v) => esc(v ?? ''))
      .join(','),
  );
  return [head.map(esc).join(','), ...lines].join('\n');
}

export function AdminClient({ leads, adminEmail }: { leads: WaitlistRow[]; adminEmail: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState('');
  // Local copy so a delete removes the row instantly; re-synced whenever the
  // server component re-fetches (refresh / revalidatePath).
  const [rows, setRows] = useState(leads);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Row awaiting delete confirmation (drives the in-app modal, not a native
  // window.confirm — that showed the browser's "localhost says…" chrome).
  const [confirmTarget, setConfirmTarget] = useState<WaitlistRow | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  useEffect(() => setRows(leads), [leads]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      [r.name, r.business, r.contact, r.email, ...(r.selected ?? []), ...(r.rejected ?? [])]
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [rows, q]);

  const totalPicks = useMemo(() => rows.reduce((n, r) => n + (r.selected?.length ?? 0), 0), [rows]);

  function refresh() {
    startTransition(() => router.refresh());
  }

  // Clicking a row's Delete just opens the confirmation modal.
  function onDelete(r: WaitlistRow) {
    if (deletingId) return;
    setErrorMsg(null);
    setConfirmTarget(r);
  }

  // Runs only after the user confirms in the modal.
  async function confirmDelete() {
    const r = confirmTarget;
    if (!r) return;
    setConfirmTarget(null);
    setDeletingId(r.id);
    const prev = rows;
    setRows((rs) => rs.filter((x) => x.id !== r.id)); // optimistic
    const res = await deleteLead(r.id);
    setDeletingId(null);
    if (!res.ok) {
      setRows(prev); // restore on failure
      setErrorMsg('Could not delete the response: ' + (res.error ?? 'unknown error') + '. Please try again.');
    }
  }

  function exportCsv() {
    const blob = new Blob([toCsv(filtered)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pixie-waitlist.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-white">
            <Sparkles className="h-5 w-5 text-indigo-400" strokeWidth={2.2} />
            Waitlist responses
          </h1>
          <p className="mt-0.5 break-all text-sm text-slate-400">Signed in as {adminEmail}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 disabled:opacity-60"
          >
            <RefreshCw className={'h-4 w-4 ' + (pending ? 'animate-spin' : '')} strokeWidth={2.2} />
            Refresh
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!filtered.length}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 disabled:opacity-40"
          >
            <Download className="h-4 w-4" strokeWidth={2.2} />
            CSV
          </button>
          <SignOutButton />
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
          <div className="flex items-center gap-2 text-slate-400">
            <Users className="h-4 w-4" strokeWidth={2.2} />
            <span className="text-xs font-medium uppercase tracking-wide">Total leads</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-white">{rows.length}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
          <div className="flex items-center gap-2 text-slate-400">
            <Check className="h-4 w-4" strokeWidth={2.2} />
            <span className="text-xs font-medium uppercase tracking-wide">Service picks</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-white">{totalPicks}</p>
        </div>
        <div className="col-span-2 rounded-xl border border-white/10 bg-slate-900/50 p-4 sm:col-span-1">
          <div className="flex items-center gap-2 text-slate-400">
            <Search className="h-4 w-4" strokeWidth={2.2} />
            <span className="text-xs font-medium uppercase tracking-wide">Showing</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-white">{filtered.length}</p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2">
        <Search className="h-4 w-4 text-slate-500" strokeWidth={2.2} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, business, email, service…"
          className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
        />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/30 py-16 text-center">
          <p className="text-sm text-slate-400">
            {rows.length === 0
              ? 'No responses yet. Submit one from /join-pixie — it’ll appear here.'
              : 'No responses match your search.'}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: stacked cards (the wide table doesn't fit small screens). */}
          <ul className="space-y-3 md:hidden">
            {filtered.map((r, i) => (
              <li key={r.id} className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="font-mono text-slate-500">#{i + 1}</span>
                    <span>{fmtDate(r.created_at)}</span>
                  </div>
                  <span className="whitespace-nowrap rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs font-semibold text-indigo-300 ring-1 ring-indigo-400/20">
                    {r.selected?.length ?? 0} / 6
                  </span>
                </div>

                <div className="font-medium text-white">{r.name || '—'}</div>
                {r.business && <div className="text-xs text-slate-400">{r.business}</div>}

                <div className="mt-2 break-all text-sm text-slate-200">{r.email}</div>
                {r.contact && <div className="break-all text-xs text-slate-400">{r.contact}</div>}

                {(r.selected?.length || r.rejected?.length) ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(r.selected ?? []).map((s) => (
                      <Chip key={'y' + s} label={s} kind="yes" />
                    ))}
                    {(r.rejected ?? []).map((s) => (
                      <Chip key={'n' + s} label={s} kind="no" />
                    ))}
                  </div>
                ) : null}

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onDelete(r)}
                    disabled={deletingId === r.id}
                    title="Delete this response"
                    aria-label={`Delete ${r.name || r.email}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
                  >
                    {deletingId === r.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.4} />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2.4} />
                    )}
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop / tablet: full table. */}
          <div className="hidden overflow-x-auto rounded-xl border border-white/10 md:block">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="bg-slate-900/70 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Lead</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Interested</th>
                <th className="px-4 py-3 font-medium">Services</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((r, i) => (
                <tr key={r.id} className="align-top transition hover:bg-white/[0.03]">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500">{i + 1}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-400">{fmtDate(r.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{r.name || '—'}</div>
                    {r.business && <div className="text-xs text-slate-400">{r.business}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-200">{r.email}</div>
                    {r.contact && <div className="text-xs text-slate-400">{r.contact}</div>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs font-semibold text-indigo-300 ring-1 ring-indigo-400/20">
                      {r.selected?.length ?? 0} / 6
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-md flex-wrap gap-1.5">
                      {(r.selected ?? []).map((s) => (
                        <Chip key={'y' + s} label={s} kind="yes" />
                      ))}
                      {(r.rejected ?? []).map((s) => (
                        <Chip key={'n' + s} label={s} kind="no" />
                      ))}
                      {!(r.selected?.length || r.rejected?.length) && (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onDelete(r)}
                      disabled={deletingId === r.id}
                      title="Delete this response"
                      aria-label={`Delete ${r.name || r.email}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
                    >
                      {deletingId === r.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.4} />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2.4} />
                      )}
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}

      {/* Delete confirmation modal — replaces the native window.confirm. */}
      {confirmTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          {/* Backdrop — click to dismiss. */}
          <button
            type="button"
            aria-label="Cancel"
            onClick={() => setConfirmTarget(null)}
            className="absolute inset-0 cursor-default bg-slate-950/70 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl shadow-black/40">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500/15 ring-1 ring-rose-400/20">
                <AlertTriangle className="h-5 w-5 text-rose-300" strokeWidth={2.4} />
              </div>
              <div className="min-w-0">
                <h2 id="delete-modal-title" className="text-base font-semibold text-white">
                  Delete this waitlist response?
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  You’re about to permanently delete the response from{' '}
                  <span className="font-medium text-slate-200">
                    {confirmTarget.name || confirmTarget.email || 'this lead'}
                  </span>
                  . This action can’t be undone.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500"
              >
                <Trash2 className="h-4 w-4" strokeWidth={2.4} />
                Delete response
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error toast — replaces the native window.alert on failure. */}
      {errorMsg && (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <div className="flex max-w-md items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-950/90 px-4 py-3 shadow-lg shadow-black/40 backdrop-blur">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" strokeWidth={2.4} />
            <p className="text-sm text-rose-100">{errorMsg}</p>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              aria-label="Dismiss"
              className="shrink-0 rounded p-0.5 text-rose-300 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" strokeWidth={2.4} />
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
