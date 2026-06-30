'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Download, RefreshCw, Search, Sparkles, Users, X } from 'lucide-react';
import type { WaitlistRow } from '@/lib/waitlistStore';
import { SignOutButton } from './SignOutButton';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return leads;
    return leads.filter((r) =>
      [r.name, r.business, r.contact, r.email, ...(r.selected ?? []), ...(r.rejected ?? [])]
        .join(' ')
        .toLowerCase()
        .includes(term),
    );
  }, [leads, q]);

  const totalPicks = useMemo(() => leads.reduce((n, r) => n + (r.selected?.length ?? 0), 0), [leads]);

  function refresh() {
    startTransition(() => router.refresh());
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
          <p className="mt-0.5 text-sm text-slate-400">Signed in as {adminEmail}</p>
        </div>
        <div className="flex items-center gap-2">
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
          <p className="mt-1 text-2xl font-semibold text-white">{leads.length}</p>
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
            {leads.length === 0
              ? 'No responses yet. Submit one from /join-pixie — it’ll appear here.'
              : 'No responses match your search.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="bg-slate-900/70 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Lead</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Interested</th>
                <th className="px-4 py-3 font-medium">Services</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((r) => (
                <tr key={r.id} className="align-top transition hover:bg-white/[0.03]">
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
