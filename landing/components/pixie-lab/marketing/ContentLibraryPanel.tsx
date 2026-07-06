'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Image as ImageIcon, Send, FileText } from 'lucide-react';
import { metaApi } from '@/lib/pixie-lab/servicesClient';
import type { MetaContentItem, ContentAsset } from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, OfflineState, ErrorState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';

const ACCENT = '#EC4899';

const CONTENT_STATUS_COLOR: Record<string, string> = {
  published: '#22c55e',
  scheduled: '#3b82f6',
  draft: '#f59e0b',
  failed: '#ef4444',
  pending: '#f59e0b',
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

function ContentRow({ item }: { item: MetaContentItem }) {
  const statusColor = CONTENT_STATUS_COLOR[item.status || ''] || '#64748b';
  return (
    <div className="flex items-start gap-4 border-b border-[var(--pl-border)] px-4 py-3.5 last:border-b-0">
      {item.media_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.media_url}
          alt=""
          className="h-12 w-12 flex-none rounded-xl object-cover"
        />
      ) : (
        <span className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-[var(--pl-surface-soft)]">
          <FileText size={18} className="text-[var(--pl-text-muted)]" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {item.platform && (
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">
              {item.platform}
            </span>
          )}
          {item.status && <Badge color={statusColor}>{item.status}</Badge>}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[13px] text-[var(--pl-text-soft)]">
          {item.caption || '(no caption)'}
        </p>
        {item.created_at && (
          <p className="mt-0.5 text-[11.5px] text-[var(--pl-text-muted)]">
            {new Date(item.created_at).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
}

function AssetGrid({ assets }: { assets: ContentAsset[] }) {
  if (assets.length === 0) return null;
  return (
    <div>
      <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">
        Media assets ({assets.length})
      </p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {assets.map((a) => (
          <div key={a.id} className="group relative aspect-square overflow-hidden rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)]">
            {a.public_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={a.public_url}
                alt={a.filename || ''}
                className="h-full w-full object-cover transition group-hover:opacity-80"
              />
            ) : (
              <div className="grid h-full w-full place-items-center">
                <ImageIcon size={20} className="text-[var(--pl-text-muted)]" />
              </div>
            )}
            {a.asset_type && (
              <span className="absolute bottom-1 right-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                {a.asset_type}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface PrepareForm {
  platform: string;
  content_type: string;
  idea: string;
  media_asset_id: string;
}

const BLANK_FORM: PrepareForm = { platform: '', content_type: 'post', idea: '', media_asset_id: '' };

function PreparePostForm({
  assets,
  onQueued,
}: {
  assets: ContentAsset[];
  onQueued: () => void;
}) {
  const [form, setForm] = useState<PrepareForm>(BLANK_FORM);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof PrepareForm, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function submit() {
    if (!form.idea.trim()) { setError('Describe your idea first.'); return; }
    setBusy(true); setError(null); setToast(null);
    const d = await metaApi.preparePost({
      platform: form.platform || undefined,
      content_type: form.content_type || undefined,
      idea: form.idea,
      media_asset_id: form.media_asset_id || undefined,
    });
    setBusy(false);
    if (!d.backendUp) { setError('Service offline — try again.'); return; }
    if (d.error) { setError(d.error); return; }
    setToast(d.approval_id ? `Queued for approval (id: ${d.approval_id})` : 'Queued for approval');
    setForm(BLANK_FORM);
    onQueued();
  }

  const inputCls =
    'w-full rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[13px] text-[var(--pl-text)] outline-none focus:border-[var(--pl-border-strong)] placeholder-[var(--pl-text-muted)]';
  const selectCls = `${inputCls} cursor-pointer`;

  return (
    <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5">
      <p className="mb-4 font-display text-[14.5px] font-bold text-[var(--pl-text)]">Prepare a post</p>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">Platform</label>
            <select className={selectCls} value={form.platform} onChange={(e) => set('platform', e.target.value)}>
              <option value="">Any / auto-select</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">Content type</label>
            <select className={selectCls} value={form.content_type} onChange={(e) => set('content_type', e.target.value)}>
              <option value="post">Post</option>
              <option value="reel">Reel</option>
              <option value="story">Story</option>
              <option value="carousel">Carousel</option>
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">Idea / brief</label>
          <textarea
            rows={3}
            placeholder="What should this post be about?"
            className={`${inputCls} resize-none`}
            value={form.idea}
            onChange={(e) => set('idea', e.target.value)}
          />
        </div>
        {assets.length > 0 && (
          <div>
            <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-[var(--pl-text-muted)]">Media asset (optional)</label>
            <select className={selectCls} value={form.media_asset_id} onChange={(e) => set('media_asset_id', e.target.value)}>
              <option value="">None</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>{a.filename || a.id}</option>
              ))}
            </select>
          </div>
        )}
        {error && <p className="text-[12.5px] text-amber-500">{error}</p>}
        {toast && (
          <div className="rounded-xl bg-[var(--pl-surface-soft)] px-3 py-2 text-[12.5px] text-[var(--pl-text-soft)]">
            {toast} — check the{' '}
            <a href="/pixie-lab/marketing/approvals" className="font-semibold" style={{ color: ACCENT }}>
              Approvals
            </a>{' '}
            tab.
          </div>
        )}
        <button
          onClick={submit}
          disabled={busy || !form.idea.trim()}
          className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-bold text-white disabled:opacity-50"
          style={{ background: ACCENT }}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {busy ? 'Queuing…' : 'Queue for approval'}
        </button>
      </div>
    </div>
  );
}

/**
 * ContentLibraryPanel — lists published/scheduled/draft content from Meta and
 * uploaded media assets. Includes a "Prepare post" mini-form that routes through
 * the approvals flow.
 */
export function ContentLibraryPanel() {
  const [loadStatus, setLoadStatus] = useState<'loading' | 'done' | 'offline' | 'error'>('loading');
  const [content, setContent] = useState<MetaContentItem[]>([]);
  const [assets, setAssets] = useState<ContentAsset[]>([]);

  const load = useCallback(() => {
    setLoadStatus('loading');
    metaApi.content().then((d) => {
      if (!d.backendUp) { setLoadStatus('offline'); return; }
      if (d.error) { setLoadStatus('error'); return; }
      setContent(Array.isArray(d.content) ? d.content : []);
      setAssets(Array.isArray(d.assets) ? d.assets : []);
      setLoadStatus('done');
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loadStatus === 'loading') return <div className="mt-6"><LoadingCards count={3} height="h-20" /></div>;
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
        title="Couldn't load content"
        body="The marketing service returned an error."
        action={<button onClick={load} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>}
      />
    </div>
  );

  return (
    <div className="mt-6 space-y-6">
      <PreparePostForm assets={assets} onQueued={load} />

      {/* Published / scheduled content */}
      {content.length === 0 ? (
        <EmptyState
          title="No content yet"
          body="Posts prepared through the form above will appear here once published or scheduled."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--pl-border)]">
            <p className="font-display text-[14px] font-bold text-[var(--pl-text)]">Content ({content.length})</p>
          </div>
          {content.map((item) => <ContentRow key={item.id} item={item} />)}
        </div>
      )}

      <AssetGrid assets={assets} />
    </div>
  );
}
