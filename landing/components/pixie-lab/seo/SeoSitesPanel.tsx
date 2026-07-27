'use client';

import { useCallback, useEffect, useState } from 'react';
import { Globe, Loader2, Plus, Pencil, Trash2, Check, X, AlertTriangle } from 'lucide-react';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type { SeoDurableSite } from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, OfflineState, LoadingCards, ErrorState } from '@/components/pixie-lab/services/ServiceStates';
import Link from 'next/link';
import { seoRoutes } from '@/lib/pixie-lab/seoRoutes';

const ACCENT = '#14B8A6';

const input = 'w-full rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[13px] text-[var(--pl-text)] outline-none focus:border-[var(--pl-border-strong)] placeholder-[var(--pl-text-muted)]';

interface SiteFormState {
  domain: string;
  canonical_base_url: string;
  display_name: string;
  country: string;
  language: string;
  crawl_limit: string;
  crawl_frequency: string;
  robots_policy: 'respect' | 'ignore';
  sitemap_urls: string;
  included_paths: string;
  excluded_paths: string;
  competitor_domains: string; // future-ready optional field (not sent to API yet)
}

const BLANK_FORM: SiteFormState = {
  domain: '',
  canonical_base_url: '',
  display_name: '',
  country: '',
  language: '',
  crawl_limit: '500',
  crawl_frequency: 'weekly',
  robots_policy: 'respect',
  sitemap_urls: '',
  included_paths: '',
  excluded_paths: '',
  competitor_domains: '',
};

function parseLines(s: string): string[] {
  return s.split('\n').map((l) => l.trim()).filter(Boolean);
}

function SiteForm({
  initial,
  onSave,
  onCancel,
  saveLabel = 'Add site',
}: {
  initial?: SiteFormState;
  onSave: (f: SiteFormState) => Promise<string | null>;
  onCancel: () => void;
  saveLabel?: string;
}) {
  const [form, setForm] = useState<SiteFormState>(initial ?? BLANK_FORM);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: keyof SiteFormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.domain.trim()) { setErr('Domain is required.'); return; }
    setBusy(true); setErr(null);
    const e = await onSave(form);
    setBusy(false);
    if (e) setErr(e);
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5">
      <h3 className="font-display text-[14.5px] font-bold text-[var(--pl-text)]">{saveLabel === 'Add site' ? 'Add a site' : 'Edit site settings'}</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[var(--pl-text-muted)]">Domain <span className="text-red-400">*</span></label>
          <input className={input} placeholder="example.com" value={form.domain} onChange={(e) => set('domain', e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[var(--pl-text-muted)]">Display name</label>
          <input className={input} placeholder="My Site" value={form.display_name} onChange={(e) => set('display_name', e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[var(--pl-text-muted)]">Canonical base URL</label>
          <input className={input} placeholder="https://example.com" value={form.canonical_base_url} onChange={(e) => set('canonical_base_url', e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[var(--pl-text-muted)]">Crawl limit (pages)</label>
          <input className={input} type="number" min={1} max={10000} value={form.crawl_limit} onChange={(e) => set('crawl_limit', e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[var(--pl-text-muted)]">Country</label>
          <input className={input} placeholder="US" value={form.country} onChange={(e) => set('country', e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[var(--pl-text-muted)]">Language</label>
          <input className={input} placeholder="en" value={form.language} onChange={(e) => set('language', e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[var(--pl-text-muted)]">Crawl frequency</label>
          <select className={input} value={form.crawl_frequency} onChange={(e) => set('crawl_frequency', e.target.value)}>
            {['manual', 'daily', 'weekly', 'monthly'].map((o) => (
              <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[var(--pl-text-muted)]">Robots policy</label>
          <select className={input} value={form.robots_policy} onChange={(e) => set('robots_policy', e.target.value as 'respect' | 'ignore')}>
            <option value="respect">Respect robots.txt</option>
            <option value="ignore">Ignore robots.txt</option>
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[12px] font-semibold text-[var(--pl-text-muted)]">Sitemap URLs (one per line)</label>
        <textarea className={`${input} min-h-[60px] resize-y`} placeholder="https://example.com/sitemap.xml" value={form.sitemap_urls} onChange={(e) => set('sitemap_urls', e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[var(--pl-text-muted)]">Included paths (one per line)</label>
          <textarea className={`${input} min-h-[60px] resize-y`} placeholder="/blog/" value={form.included_paths} onChange={(e) => set('included_paths', e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[var(--pl-text-muted)]">Excluded paths (one per line)</label>
          <textarea className={`${input} min-h-[60px] resize-y`} placeholder="/admin/" value={form.excluded_paths} onChange={(e) => set('excluded_paths', e.target.value)} />
        </div>
      </div>

      {/* Future-ready optional field — not wired to API yet */}
      <div>
        <label className="mb-1 block text-[12px] font-semibold text-[var(--pl-text-muted)]">
          Competitor domains <span className="ml-1 rounded-full bg-[var(--pl-surface-soft)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--pl-text-muted)]">coming soon</span>
        </label>
        <textarea className={`${input} min-h-[48px] resize-y opacity-60`} placeholder="competitor.com" value={form.competitor_domains} onChange={(e) => set('competitor_domains', e.target.value)} disabled />
      </div>

      {err && <p className="flex items-center gap-1.5 text-[12.5px] text-amber-500"><AlertTriangle size={13} />{err}</p>}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-bold text-[#02120f] disabled:opacity-50"
          style={{ background: ACCENT }}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {saveLabel}
        </button>
        <button onClick={onCancel} className="rounded-xl border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)]">
          <X size={14} className="inline" /> Cancel
        </button>
      </div>
    </div>
  );
}

export function SeoSitesPanel() {
  const [status, setStatus] = useState<'loading' | 'done' | 'offline'>('loading');
  const [sites, setSites] = useState<SeoDurableSite[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    const d = await seoApi.listSites();
    if (!d.backendUp) { setStatus('offline'); return; }
    setSites(d.sites ?? []);
    setStatus('done');
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(f: SiteFormState): Promise<string | null> {
    const d = await seoApi.createSite({
      domain: f.domain.trim(),
      canonical_base_url: f.canonical_base_url.trim() || undefined,
      display_name: f.display_name.trim() || undefined,
      country: f.country.trim() || undefined,
      language: f.language.trim() || undefined,
      crawl_limit: f.crawl_limit ? Number(f.crawl_limit) : undefined,
      crawl_frequency: f.crawl_frequency || undefined,
      robots_policy: f.robots_policy,
      sitemap_urls: parseLines(f.sitemap_urls).length ? parseLines(f.sitemap_urls) : undefined,
      included_paths: parseLines(f.included_paths).length ? parseLines(f.included_paths) : undefined,
      excluded_paths: parseLines(f.excluded_paths).length ? parseLines(f.excluded_paths) : undefined,
    });
    if (!d.backendUp) return 'Service unavailable. Please retry.';
    if (d.error || !d.site) return d.error ?? 'Failed to create site.';
    setShowAdd(false);
    await load();
    return null;
  }

  async function handleEdit(siteId: string, f: SiteFormState): Promise<string | null> {
    const d = await seoApi.patchSite(siteId, {
      canonical_base_url: f.canonical_base_url.trim() || undefined,
      display_name: f.display_name.trim() || undefined,
      country: f.country.trim() || undefined,
      language: f.language.trim() || undefined,
      crawl_limit: f.crawl_limit ? Number(f.crawl_limit) : undefined,
      crawl_frequency: f.crawl_frequency || undefined,
      robots_policy: f.robots_policy,
      sitemap_urls: parseLines(f.sitemap_urls).length ? parseLines(f.sitemap_urls) : undefined,
      included_paths: parseLines(f.included_paths).length ? parseLines(f.included_paths) : undefined,
      excluded_paths: parseLines(f.excluded_paths).length ? parseLines(f.excluded_paths) : undefined,
    });
    if (!d.backendUp) return 'Service unavailable. Please retry.';
    if (d.error || !d.site) return d.error ?? 'Failed to update site.';
    setEditId(null);
    await load();
    return null;
  }

  async function handleDelete(siteId: string) {
    setDeleting(true);
    await seoApi.deleteSite(siteId);
    setDeleteConfirm(null);
    setDeleting(false);
    await load();
  }

  if (status === 'loading') return <div className="mt-6"><LoadingCards count={3} height="h-24" /></div>;
  if (status === 'offline') return <div className="mt-6"><OfflineState service="SEO" action={<button onClick={load} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} /></div>;

  return (
    <div className="mt-6 space-y-4">
      {/* Add new site form */}
      {showAdd ? (
        <SiteForm
          onSave={handleAdd}
          onCancel={() => setShowAdd(false)}
          saveLabel="Add site"
        />
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-bold text-[#02120f]"
          style={{ background: ACCENT }}
        >
          <Plus size={15} /> Add a site
        </button>
      )}

      {/* Sites list */}
      {sites.length === 0 && !showAdd ? (
        <EmptyState
          title="No sites yet"
          body="Add your first site to start crawling and tracking your SEO health."
        />
      ) : (
        <div className="space-y-3">
          {sites.map((site) => {
            if (editId === site.id) {
              const formInit: SiteFormState = {
                domain: site.domain ?? '',
                canonical_base_url: site.canonical_base_url ?? '',
                display_name: site.display_name ?? '',
                country: site.country ?? '',
                language: site.language ?? '',
                crawl_limit: String(site.crawl_limit ?? 500),
                crawl_frequency: site.crawl_frequency ?? 'weekly',
                robots_policy: (site.robots_policy ?? 'respect') as 'respect' | 'ignore',
                sitemap_urls: (site.sitemap_urls ?? []).join('\n'),
                included_paths: (site.included_paths ?? []).join('\n'),
                excluded_paths: (site.excluded_paths ?? []).join('\n'),
                competitor_domains: '',
              };
              return (
                <SiteForm
                  key={site.id}
                  initial={formInit}
                  onSave={(f) => handleEdit(site.id, f)}
                  onCancel={() => setEditId(null)}
                  saveLabel="Save changes"
                />
              );
            }
            return (
              <div key={site.id} className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-[var(--pl-surface-soft)]" style={{ color: ACCENT }}>
                      <Globe size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-display text-[14.5px] font-bold text-[var(--pl-text)]">{site.display_name || site.domain}</p>
                      {site.display_name && <p className="text-[12px] text-[var(--pl-text-muted)]">{site.domain}</p>}
                      <div className="mt-1 flex flex-wrap gap-2 text-[11.5px] text-[var(--pl-text-muted)]">
                        {site.crawl_limit && <span>Limit: {site.crawl_limit} pages</span>}
                        {site.crawl_frequency && <span>· {site.crawl_frequency}</span>}
                        {site.country && <span>· {site.country.toUpperCase()}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={seoRoutes.crawls({ site_id: site.id })}
                      className="rounded-lg border border-[var(--pl-border)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]"
                    >
                      Crawls
                    </Link>
                    <button
                      onClick={() => setEditId(site.id)}
                      aria-label="Edit site"
                      className="rounded-lg border border-[var(--pl-border)] p-1.5 text-[var(--pl-text-muted)] transition hover:text-[var(--pl-text)]"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(site.id)}
                      aria-label="Delete site"
                      className="rounded-lg border border-[var(--pl-border)] p-1.5 text-[var(--pl-text-muted)] transition hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Delete confirmation inline */}
                {deleteConfirm === site.id && (
                  <div className="mt-3 flex items-center gap-3 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2">
                    <AlertTriangle size={14} className="text-red-400" />
                    <span className="flex-1 text-[12.5px] text-[var(--pl-text-soft)]">Delete <strong>{site.display_name || site.domain}</strong>? This cannot be undone.</span>
                    <button
                      onClick={() => handleDelete(site.id)}
                      disabled={deleting}
                      className="inline-flex items-center gap-1 rounded-lg bg-red-500 px-3 py-1 text-[12px] font-bold text-white disabled:opacity-60"
                    >
                      {deleting ? <Loader2 size={12} className="animate-spin" /> : null} Delete
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="rounded-lg border border-[var(--pl-border)] px-3 py-1 text-[12px] font-semibold text-[var(--pl-text-muted)]"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
