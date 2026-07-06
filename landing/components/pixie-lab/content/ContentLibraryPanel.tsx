'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Trash2, Image as ImageIcon, Film, Plus, HardDrive } from 'lucide-react';
import { contentApi } from '@/lib/pixie-lab/servicesClient';
import type { ContentAsset, StorageStatus, Envelope } from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, ErrorState, OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';

const ACCENT = '#D4AF37';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  storage: Envelope<StorageStatus>;
}

/**
 * ContentLibraryPanel — responsive grid of media assets from contentApi.assets().
 * Supports optimistic delete via contentApi.remove(). Shows a storage provider
 * chip and a durability warning if the backend flags one. Each asset card shows
 * a preview (image or video), filename, type badge, and file size.
 */
export function ContentLibraryPanel({ storage }: Props) {
  const [fetchState, setFetchState] = useState<'loading' | 'done' | 'offline' | 'error'>('loading');
  const [assets, setAssets] = useState<ContentAsset[]>([]);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setFetchState('loading');
    contentApi.assets().then((d) => {
      if (!d.backendUp) { setFetchState('offline'); return; }
      setAssets(Array.isArray(d.assets) ? d.assets : []);
      setFetchState('done');
    }).catch(() => setFetchState('error'));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function remove(id: string) {
    // Optimistic: remove from list immediately, then sync
    setAssets((prev) => prev.filter((a) => a.id !== id));
    setDeleting((prev) => new Set([...prev, id]));
    await contentApi.remove(id);
    setDeleting((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  const provider = storage.provider;
  const warning = storage.persistence?.warning;

  /* ── Loading ── */
  if (fetchState === 'loading') return <LoadingCards count={6} height="h-44" />;

  /* ── Offline ── */
  if (fetchState === 'offline') {
    return <OfflineState service="Content" action={
      <button onClick={load} className="rounded-xl border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]">
        Retry
      </button>
    } />;
  }

  /* ── Error ── */
  if (fetchState === 'error') {
    return <ErrorState body="Could not load your media library. Please refresh to try again." action={
      <button onClick={load} className="rounded-xl border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]">
        Retry
      </button>
    } />;
  }

  return (
    <div className="space-y-4">
      {/* Storage info row */}
      {(provider || warning) && (
        <div className="flex flex-wrap items-center gap-2">
          {provider && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--pl-text-muted)]">
              <HardDrive size={12} />
              Storage: {provider}
            </span>
          )}
          {warning && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11.5px] font-semibold text-amber-500">
              ⚠ {warning}
            </span>
          )}
        </div>
      )}

      {/* Empty state */}
      {assets.length === 0 ? (
        <EmptyState
          title="No media yet"
          body="Upload images and videos to start building your content library."
          action={
            <Link
              href="/pixie-lab/content/create"
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13.5px] font-bold text-[#02120f] transition"
              style={{ background: ACCENT }}
            >
              <Plus size={15} /> Upload first asset
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {assets.map((asset) => {
            const isVideo =
              asset.asset_type === 'video' ||
              asset.asset_type === 'reel' ||
              asset.mime_type?.startsWith('video/');
            const typeLabel = asset.asset_type ?? (isVideo ? 'video' : 'image');

            return (
              <div
                key={asset.id}
                className="group relative overflow-hidden rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)]"
              >
                {/* Preview area */}
                <div className="relative aspect-square bg-[var(--pl-surface-soft)]">
                  {asset.public_url ? (
                    isVideo ? (
                      <video
                        src={asset.public_url}
                        className="h-full w-full object-cover"
                        preload="metadata"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={asset.public_url}
                        alt={asset.filename ?? 'Asset'}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    )
                  ) : (
                    <div className="grid h-full w-full place-items-center text-[var(--pl-text-muted)]">
                      {isVideo ? <Film size={28} /> : <ImageIcon size={28} />}
                    </div>
                  )}

                  {/* Type badge */}
                  <span
                    className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#02120f]"
                    style={{ background: ACCENT }}
                  >
                    {typeLabel}
                  </span>

                  {/* Delete button — visible on hover */}
                  <button
                    onClick={() => remove(asset.id)}
                    disabled={deleting.has(asset.id)}
                    className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-[var(--pl-surface)]/80 opacity-0 backdrop-blur-sm transition group-hover:opacity-100 hover:bg-red-500/20 disabled:cursor-not-allowed"
                    title="Delete asset"
                    aria-label="Delete asset"
                    style={{ color: 'var(--pl-text-muted)' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Info footer */}
                <div className="p-3">
                  <p className="truncate text-[12.5px] font-semibold text-[var(--pl-text)]">
                    {asset.filename ?? 'Untitled'}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-[var(--pl-text-muted)]">
                    {asset.size_bytes != null ? formatSize(asset.size_bytes) : '—'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
