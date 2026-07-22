'use client';

import { useEffect, useState } from 'react';
import { Send, X, CalendarClock, Zap } from 'lucide-react';
import {
  createPublishJob, getPublishingConfig, listConnections,
  type ContentFormat, type Platform, type SocialConnection, type SourceProduct, type PublishingConfig,
} from '@/lib/pixie-lab/publishingClient';
import { ACCENT, ErrorNote, GhostButton, PrimaryButton, Spinner, inputClass } from '../agent/ui';

/**
 * PublishDialog — schedule or immediately publish a saved content version (or an
 * approved influencer video) to a connected destination. Dry-run by default with
 * a clear badge; live requires the account to be authorized AND an explicit
 * confirmation. Only destinations that support the content format are offered.
 */
export function PublishDialog({
  open, onClose, onPublished,
  sourceProduct, contentFormat, text: initialText,
  documentId, versionId, influencerVideoId, mediaAssetIds,
}: {
  open: boolean;
  onClose: () => void;
  onPublished?: (jobId: string) => void;
  sourceProduct: SourceProduct;
  contentFormat: ContentFormat;
  text: string;
  documentId?: string;
  versionId?: string;
  influencerVideoId?: string;
  mediaAssetIds?: string[];
}) {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<PublishingConfig | null>(null);
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [connectionId, setConnectionId] = useState('');
  const [text, setText] = useState(initialText);
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [scheduledLocal, setScheduledLocal] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [live, setLive] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [doneJob, setDoneJob] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true); setError(''); setDoneJob('');
    Promise.all([getPublishingConfig(), listConnections()]).then(([c, cn]) => {
      if (c.ok) { setConfig(c.data); setTimezone(c.data.default_timezone || 'UTC'); }
      if (cn.ok) {
        const usable = cn.data.connections.filter((x) => x.capabilities.formats_supported[contentFormat]);
        setConnections(usable);
        if (usable[0]) setConnectionId(usable[0].connection_id);
      }
      setLoading(false);
    });
    try { setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'); } catch { /* keep default */ }
  }, [open, contentFormat]);

  if (!open) return null;

  const selected = connections.find((c) => c.connection_id === connectionId);
  const liveAllowed = Boolean(config?.live_allowed);
  const canLive = liveAllowed && Boolean(selected?.publishing_authorized);
  const mode = live && canLive ? 'live' : 'dry_run';

  async function submit() {
    if (!connectionId) { setError('Choose a destination account.'); return; }
    if (mode === 'live' && !confirm) { setError('Confirm live publishing to continue.'); return; }
    setBusy(true); setError('');
    const res = await createPublishJob({
      sourceProduct, connectionId, platform: (selected?.platform || 'facebook') as Platform,
      contentFormat, text, mediaAssetIds, documentId, versionId, influencerVideoId,
      mode, scheduledLocal: when === 'later' ? scheduledLocal : '', timezone,
      confirm: mode === 'live',
    });
    setBusy(false);
    if (!res.ok) { setError(res.error.message); return; }
    setDoneJob(res.data.id);
    onPublished?.(res.data.id);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Publish content">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5 shadow-xl">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${ACCENT}1a`, color: ACCENT }}><Send size={16} /></span>
          <h2 className="flex-1 font-display text-[1.05rem] font-extrabold tracking-tight text-[var(--pl-text)]">Publish</h2>
          <button onClick={onClose} aria-label="Close" className="text-[var(--pl-text-muted)] hover:text-[var(--pl-text)]"><X size={18} /></button>
        </div>

        {loading ? <Spinner label="Loading destinations…" /> : doneJob ? (
          <div className="py-4 text-center">
            <p className="font-display text-[15px] font-bold text-[var(--pl-text)]">{when === 'later' ? 'Scheduled' : mode === 'dry_run' ? 'Queued (dry-run)' : 'Publishing'}</p>
            <p className="mt-1 text-[13px] text-[var(--pl-text-muted)]">Job created. Track it in the publishing queue.</p>
            <div className="mt-4 flex justify-center gap-2"><GhostButton onClick={onClose}>Done</GhostButton></div>
          </div>
        ) : connections.length === 0 ? (
          <div className="py-4 text-center text-[13px] text-[var(--pl-text-muted)]">
            No connected account supports this content type. Connect a Facebook Page or Instagram account first.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Destination */}
            <div>
              <label htmlFor="pub-dest" className="mb-1.5 block text-[12.5px] font-semibold text-[var(--pl-text-muted)]">Destination</label>
              <select id="pub-dest" className={inputClass} value={connectionId} onChange={(e) => setConnectionId(e.target.value)}>
                {connections.map((c) => <option key={c.connection_id} value={c.connection_id}>{c.display_name} ({c.platform})</option>)}
              </select>
              {selected && !selected.publishing_authorized && (
                <p className="mt-1 text-[11.5px] text-amber-500">This account needs reconnection with publishing permission{selected.capabilities.missing_scopes.length ? ` (${selected.capabilities.missing_scopes.join(', ')})` : ''}.</p>
              )}
            </div>

            {/* Caption */}
            <div>
              <label htmlFor="pub-text" className="mb-1.5 block text-[12.5px] font-semibold text-[var(--pl-text-muted)]">Caption / text</label>
              <textarea id="pub-text" rows={4} className={`${inputClass} resize-y`} value={text} onChange={(e) => setText(e.target.value)} />
              <p className="mt-1 text-[11px] text-[var(--pl-text-muted)]">Editing here creates a publishing snapshot; your saved version is unchanged.</p>
            </div>

            {/* When */}
            <div>
              <span className="mb-1.5 block text-[12.5px] font-semibold text-[var(--pl-text-muted)]">When</span>
              <div className="flex gap-2">
                <ModeTab active={when === 'now'} onClick={() => setWhen('now')}><Zap size={13} /> Publish now</ModeTab>
                <ModeTab active={when === 'later'} onClick={() => setWhen('later')}><CalendarClock size={13} /> Schedule</ModeTab>
              </div>
              {when === 'later' && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <input aria-label="Date and time" type="datetime-local" className={inputClass} value={scheduledLocal} onChange={(e) => setScheduledLocal(e.target.value)} />
                  <input aria-label="Timezone" className={inputClass} value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="IANA timezone" />
                </div>
              )}
            </div>

            {/* Mode badge + live toggle */}
            <div className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
                  style={mode === 'live' ? { borderColor: '#e5484d', color: '#e5484d' } : { borderColor: 'var(--pl-border)', color: 'var(--pl-text-muted)' }}>
                  {mode === 'live' ? 'LIVE' : 'Dry run'}
                </span>
                <span className="text-[12px] text-[var(--pl-text-muted)]">
                  {mode === 'live' ? 'This will post to the real account.' : 'Simulated — nothing is posted live.'}
                </span>
              </div>
              {liveAllowed ? (
                <label className="mt-2 flex items-center gap-2 text-[12.5px] text-[var(--pl-text)]">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--pl-green)]" checked={live} disabled={!selected?.publishing_authorized} onChange={(e) => { setLive(e.target.checked); setConfirm(false); }} />
                  Publish live {selected && !selected.publishing_authorized ? '(account not authorized)' : ''}
                </label>
              ) : (
                <p className="mt-2 text-[11.5px] text-[var(--pl-text-muted)]">Live publishing is disabled in this environment — dry-run only.</p>
              )}
              {mode === 'live' && (
                <label className="mt-2 flex items-center gap-2 text-[12.5px] text-amber-600">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--pl-green)]" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
                  I confirm this will publish live (billing is not enforced).
                </label>
              )}
            </div>

            {error && <ErrorNote>{error}</ErrorNote>}

            <div className="flex justify-end gap-2">
              <GhostButton onClick={onClose}>Cancel</GhostButton>
              <PrimaryButton busy={busy} disabled={busy} onClick={submit}><Send size={14} /> {when === 'later' ? 'Schedule' : mode === 'live' ? 'Publish live' : 'Queue dry-run'}</PrimaryButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ModeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition"
      style={active ? { borderColor: 'var(--pl-green)', color: 'var(--pl-green)', background: 'color-mix(in srgb, var(--pl-green) 10%, transparent)' } : { borderColor: 'var(--pl-border)', color: 'var(--pl-text-muted)' }}>
      {children}
    </button>
  );
}
