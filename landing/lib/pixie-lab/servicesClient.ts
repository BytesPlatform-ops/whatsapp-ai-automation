'use client';

/**
 * Typed browser client for the Pixie service proxies under /api/lab/*. Components
 * call these instead of hand-rolling fetches, so error/offline handling and the
 * response shapes stay consistent. Every proxy resolves the workspace tenant
 * server-side, so nothing here takes or sends a tenant id.
 */
import type {
  SeoAuditResult, SeoConnectionPlatform, SeoHistoryAudit,
  MetaStatus, MetaInboxItem, MetaContentItem,
  ContentAsset, StorageStatus, ApprovalItem, Envelope,
} from './serviceTypes';

async function req<T>(url: string, init?: RequestInit): Promise<Envelope<T>> {
  try {
    const r = await fetch(url, { cache: 'no-store', ...init });
    const d = (await r.json().catch(() => ({}))) as Envelope<T>;
    if (!r.ok && d.backendUp === undefined) return { backendUp: false, error: d.error || `Request failed (${r.status})` } as Envelope<T>;
    return d;
  } catch {
    return { backendUp: false, error: 'Network error' } as Envelope<T>;
  }
}
function post<T>(url: string, body: Record<string, unknown>) {
  return req<T>(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

/* ------------------------------ SEO ------------------------------ */
export const seoApi = {
  runAudit: (website_url: string, opts?: { crawl_limit?: number; include_pagespeed?: boolean }) =>
    post<SeoAuditResult>('/api/lab/seo/audit', { website_url, ...opts }),
  getAudit: (audit_id: string) =>
    req<{ audit: SeoAuditResult['audit']; issues: SeoAuditResult['issues'] }>(`/api/lab/seo/audit?audit_id=${encodeURIComponent(audit_id)}`),
  history: () => req<{ audits: SeoHistoryAudit[] }>('/api/lab/seo/history'),
  connections: () => req<{ platforms: SeoConnectionPlatform[] }>('/api/lab/seo/connections'),
  connectWordpress: (site_url: string, username: string, application_password: string) =>
    post<{ status: string; message?: string; connected_as?: string }>('/api/lab/seo/connections', { kind: 'wordpress', site_url, username, application_password }),
  connectToken: (platform: string, token: string, site_id?: string) =>
    post<{ status: string; message?: string }>('/api/lab/seo/connections', { kind: 'token', platform, token, site_id }),
  disconnect: (platform: string) =>
    post<{ status: string }>('/api/lab/seo/connections', { kind: 'disconnect', platform }),
  prepareFix: (audit_id: string, issue_id: string, new_value?: string) =>
    post<{ status: string; approval_id?: string; copy_text?: string; message?: string }>('/api/lab/seo/optimize', { mode: 'prepare', audit_id, issue_id, new_value }),
};

/* ------------------------------ Meta / Marketing ------------------------------ */
export const metaApi = {
  status: () => req<MetaStatus & { inbox_permissions?: unknown }>('/api/lab/meta/status'),
  inbox: (type?: 'comment' | 'dm') => req<{ inbox: MetaInboxItem[] }>(`/api/lab/meta/inbox${type ? `?type=${type}` : ''}`),
  inboxAction: (action: 'analyze' | 'prepare-reply' | 'route' | 'hide', item_id: string, reply?: string) =>
    post<{ status: string; item?: MetaInboxItem; analysis?: unknown; approval_id?: string }>('/api/lab/meta/inbox', { action, item_id, reply }),
  content: () => req<{ content: MetaContentItem[]; assets: ContentAsset[] }>('/api/lab/meta/content'),
  preparePost: (p: { platform?: string; content_type?: string; idea?: string; caption?: string; media_asset_id?: string }) =>
    post<{ status: string; message?: string; approval_id?: string }>('/api/lab/meta/content', { action: 'prepare-post', ...p }),
  analytics: (range?: string) => req<{ summary: unknown }>(`/api/lab/meta/analytics${range ? `?range=${range}` : ''}`),
  seedDemo: () => post<{ ok: boolean }>('/api/lab/meta/connect', { action: 'demo' }),
  disconnect: () => post<{ ok: boolean }>('/api/lab/meta/connect', { action: 'disconnect' }),
  connectUrl: (feature?: string) => `/api/lab/meta/connect${feature ? `?feature=${encodeURIComponent(feature)}` : ''}`,
};

/* ------------------------------ Content ------------------------------ */
export const contentApi = {
  assets: () => req<{ assets: ContentAsset[] }>('/api/lab/content/assets'),
  upload: (filename: string, content_type: string, data_base64: string, metadata?: Record<string, unknown>) =>
    post<{ status: string; asset?: ContentAsset; meta_reachable?: boolean }>('/api/lab/content/assets', { filename, content_type, data_base64, metadata }),
  remove: (id: string) => req<{ ok: boolean; deleted?: string }>(`/api/lab/content/assets?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
  storage: () => req<StorageStatus>('/api/lab/content/storage'),
};

/* ------------------------------ Approvals ------------------------------ */
export const approvalsApi = {
  list: () => req<{ items: ApprovalItem[] }>('/api/lab/approvals'),
  resolve: (id: string, decision: 'approve' | 'reject' | 'skip') => post('/api/lab/approvals', { id, decision }),
};
