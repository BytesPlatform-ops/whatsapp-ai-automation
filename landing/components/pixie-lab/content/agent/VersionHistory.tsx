'use client';

import { RotateCcw, Eye } from 'lucide-react';
import type { VersionEnvelope } from '@/lib/pixie-lab/contentAgentTypes';
import { ModeBadge } from './ui';

/**
 * VersionHistory — the version chain for a document, newest first. Shows number,
 * created date, source (generation / manual edit / regenerate), provider/model,
 * mock badge, prompt version and a preview; the current version is flagged.
 * Users can view a version or restore it (set-current).
 */
export function VersionHistory({
  versions,
  currentVersionId,
  busyId,
  onView,
  onRestore,
}: {
  versions: VersionEnvelope[];
  currentVersionId: string;
  busyId?: string;
  onView: (v: VersionEnvelope) => void;
  onRestore: (v: VersionEnvelope) => void;
}) {
  const ordered = [...versions].sort((a, b) => b.version.version_number - a.version.version_number);
  return (
    <ol className="space-y-2" aria-label="Version history">
      {ordered.map((env) => {
        const v = env.version;
        const isCurrent = env.id === currentVersionId;
        return (
          <li
            key={env.id}
            className="rounded-xl border bg-[var(--pl-surface)] p-3"
            style={{ borderColor: isCurrent ? 'var(--pl-green)' : 'var(--pl-border)' }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-[13px] font-bold text-[var(--pl-text)]">v{v.version_number}</span>
              {isCurrent && <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: 'color-mix(in srgb, var(--pl-green) 15%, transparent)', color: 'var(--pl-green)' }}>Current</span>}
              <span className="rounded-full border border-[var(--pl-border)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--pl-text-muted)]">{sourceLabel(v.created_by)}</span>
              <ModeBadge mock={v.mock} />
              <span className="ml-auto text-[11px] text-[var(--pl-text-muted)]">{fmtDate(v.created_at)}</span>
            </div>
            <p className="mt-1.5 line-clamp-2 text-[12.5px] text-[var(--pl-text-soft)]">{v.title || v.text?.slice(0, 140) || '—'}</p>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--pl-text-muted)]">
              <span>{v.provider}{v.model ? ` · ${v.model}` : ''}</span>
              {v.prompt_version && <span>· prompt {v.prompt_version}</span>}
              <span className="ml-auto flex gap-1.5">
                <button onClick={() => onView(env)} className="inline-flex items-center gap-1 rounded-md border border-[var(--pl-border)] px-2 py-1 font-semibold transition hover:text-[var(--pl-text)]">
                  <Eye size={11} /> View
                </button>
                {!isCurrent && (
                  <button
                    onClick={() => onRestore(env)}
                    disabled={busyId === env.id}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--pl-border)] px-2 py-1 font-semibold transition hover:text-[var(--pl-text)] disabled:opacity-50"
                  >
                    <RotateCcw size={11} /> Restore
                  </button>
                )}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function sourceLabel(by: string): string {
  if (by === 'manual_edit') return 'Manual edit';
  if (by === 'regenerate') return 'Regenerated';
  if (by === 'duplicate') return 'Duplicated';
  return 'Generated';
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
