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
  MetaAdAccount, MetaCampaign, MetaAdInsights,
  ContentAsset, StorageStatus, ApprovalItem, Envelope,
  RcpRunResult, RcpOverview, RcpIntegrationStatus, RcpConversation, RcpConversationDetail,
  RcpContact, RcpBooking, RcpQuote, RcpTask, RcpTicket, RcpEscalation, RcpPayment,
  RcpCampaign, RcpCampaignReply, RcpBusinessProfile, RcpKnowledgeItem, RcpHealth,
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
  // ── Ads Marketing API ──────────────────────────────────────────────────────
  adAccounts: () =>
    req<{ source?: string; ad_accounts?: MetaAdAccount[]; empty?: boolean; note?: string; error?: string; needs_reconnect?: boolean; message?: string }>('/api/lab/meta/ad-accounts'),
  selectAdAccount: (ad_account_id: string) =>
    post<{ ok?: boolean; defaults?: Record<string, unknown> }>('/api/lab/meta/ad-accounts', { ad_account_id }),
  campaigns: (ad_account_id: string) =>
    req<{ source?: string; campaigns?: MetaCampaign[]; empty?: boolean; note?: string; error?: string; needs_reconnect?: boolean; message?: string }>(`/api/lab/meta/campaigns?ad_account_id=${encodeURIComponent(ad_account_id)}`),
  createCampaign: (p: { ad_account_id: string; name: string; objective?: string }) =>
    post<{ ok?: boolean; status?: string; campaign?: MetaCampaign; note?: string; error?: string; needs_reconnect?: boolean; message?: string }>('/api/lab/meta/campaigns', p),
  insights: (ad_account_id: string, range?: string) =>
    req<{ source?: string; insights?: MetaAdInsights; empty?: boolean; note?: string; date_range?: string; error?: string; needs_reconnect?: boolean; message?: string }>(`/api/lab/meta/insights?ad_account_id=${encodeURIComponent(ad_account_id)}${range ? `&range=${encodeURIComponent(range)}` : ''}`),
};

/* ------------------------------ Content ------------------------------ */
export const contentApi = {
  assets: () => req<{ assets: ContentAsset[] }>('/api/lab/content/assets'),
  upload: (filename: string, content_type: string, data_base64: string, metadata?: Record<string, unknown>) =>
    post<{ status: string; asset?: ContentAsset; meta_reachable?: boolean }>('/api/lab/content/assets', { filename, content_type, data_base64, metadata }),
  remove: (id: string) => req<{ ok: boolean; deleted?: string }>(`/api/lab/content/assets?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
  storage: () => req<StorageStatus>('/api/lab/content/storage'),
};

/* ------------------------------ Content Creator (AI Influencer pipeline) ------------------------------ */
// Proxies to Python /api/content-creator/* via /api/lab/content-creator/[...path].
// `/status` is always 200 (the connectivity oracle); `/profile` 404s when a tenant
// has no profile yet, which the proxy surfaces as backendUp:false — callers treat
// that as "no profile yet" only when `/status` succeeded.
export const contentCreatorApi = {
  status: () => req<{
    mock_mode?: boolean; mock?: boolean; dry_run?: boolean; live_enabled?: boolean;
    banner?: string; provider?: { name?: string; mode?: string; configured?: boolean; connected?: boolean };
    approval_gates?: Record<string, boolean>;
  }>('/api/lab/content-creator/status'),
  profile: () => req<{ id?: string; profile?: {
    business_name?: string; niche?: string; target_audience?: string; content_goal?: string; brand_tone?: string;
  } }>('/api/lab/content-creator/profile'),
};

/* ------------------------------ Approvals ------------------------------ */
export const approvalsApi = {
  list: () => req<{ items: ApprovalItem[] }>('/api/lab/approvals'),
  resolve: (id: string, decision: 'approve' | 'reject' | 'skip') => post('/api/lab/approvals', { id, decision }),
};

/* ------------------------------ AI Receptionist ------------------------------ */
const R = '/api/lab/receptionist';
export const receptionistApi = {
  // brain / core
  runMessage: (p: { message: string; channel?: string; conversation_id?: string; name?: string; email?: string; phone?: string; company?: string; campaign_id?: string }) =>
    post<RcpRunResult>(`${R}/run`, p),
  getHealth: () => req<RcpHealth>(`${R}/health`),
  getCapabilities: () => req<RcpHealth>(`${R}/health`),
  getOverview: () => req<RcpOverview>(`${R}/overview`),
  getIntegrationStatus: () => req<RcpIntegrationStatus>(`${R}/integrations`),
  testIntegration: (capability: string) => post<{ capability: string; result?: unknown; status?: unknown }>(`${R}/integrations`, { action: 'test', capability }),
  // conversations
  getConversations: () => req<{ conversations: RcpConversation[] }>(`${R}/conversations`),
  getConversation: (id: string) => req<RcpConversationDetail>(`${R}/conversations?id=${encodeURIComponent(id)}`),
  sendConversationMessage: (id: string, message: string) => post<RcpRunResult>(`${R}/run`, { message, conversation_id: id }),
  escalateConversation: (id: string, reason?: string) => post<{ escalation: RcpEscalation }>(`${R}/conversations`, { action: 'escalate', id, reason }),
  // CRM / leads
  getLeads: (status?: string) => req<{ leads: RcpContact[] }>(`${R}/leads${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  updateLead: (id: string, patch: Partial<RcpContact>) => post<{ lead: RcpContact }>(`${R}/leads`, { action: 'update', id, ...patch }),
  leadFollowUp: (id: string, title?: string, due_at?: string) => post<{ task: RcpTask }>(`${R}/leads`, { action: 'follow-up', id, title, due_at }),
  // bookings
  getBookings: () => req<{ bookings: RcpBooking[] }>(`${R}/bookings`),
  createBooking: (p: Partial<RcpBooking>) => post<{ booking: RcpBooking }>(`${R}/bookings`, { action: 'create', ...p }),
  confirmBooking: (id: string) => post<{ booking: RcpBooking }>(`${R}/bookings`, { action: 'confirm', id }),
  cancelBooking: (id: string) => post<{ booking: RcpBooking }>(`${R}/bookings`, { action: 'cancel', id }),
  // quotes
  getQuotes: () => req<{ quotes: RcpQuote[] }>(`${R}/quotes`),
  createQuote: (p: Partial<RcpQuote>) => post<{ quote: RcpQuote }>(`${R}/quotes`, { action: 'create', ...p }),
  updateQuote: (id: string, patch: Partial<RcpQuote>) => post<{ quote: RcpQuote }>(`${R}/quotes`, { action: 'update', id, ...patch }),
  // tasks
  getTasks: (status?: string) => req<{ tasks: RcpTask[] }>(`${R}/tasks${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  createTask: (p: Partial<RcpTask>) => post<{ task: RcpTask }>(`${R}/tasks`, { action: 'create', ...p }),
  completeTask: (id: string) => post<{ task: RcpTask }>(`${R}/tasks`, { action: 'complete', id }),
  // tickets / escalations
  getTickets: () => req<{ tickets: RcpTicket[] }>(`${R}/tickets`),
  getEscalations: () => req<{ escalations: RcpEscalation[] }>(`${R}/tickets?resource=escalations`),
  updateTicket: (id: string, patch: Partial<RcpTicket>) => post<{ ticket: RcpTicket }>(`${R}/tickets`, { action: 'update', id, ...patch }),
  // payments
  getPayments: () => req<{ payments: RcpPayment[] }>(`${R}/payments`),
  createPaymentLink: (p: { amount: number; currency?: string; description?: string; email?: string }) => post<{ payment: RcpPayment; provider?: unknown }>(`${R}/payments`, { action: 'create-link', ...p }),
  // campaigns
  getCampaigns: () => req<{ campaigns: RcpCampaign[] }>(`${R}/campaigns`),
  getCampaignReplies: (campaign_id: string) => req<{ replies: RcpCampaignReply[] }>(`${R}/campaigns?campaign_id=${encodeURIComponent(campaign_id)}`),
  ingestCampaignReply: (p: { campaign_id?: string; message: string; email?: string; phone?: string }) => post<RcpRunResult>(`${R}/campaigns`, { action: 'ingest', ...p }),
  // business profile + knowledge
  getBusinessProfile: () => req<{ profile: RcpBusinessProfile; configured?: boolean }>(`${R}/business-profile`),
  updateBusinessProfile: (patch: Partial<RcpBusinessProfile>) => post<{ profile: RcpBusinessProfile }>(`${R}/business-profile`, patch),
  getKnowledge: () => req<{ items: RcpKnowledgeItem[] }>(`${R}/knowledge`),
  createKnowledge: (p: { title: string; content: string; category?: string; tags?: string[] }) => post<{ item: RcpKnowledgeItem }>(`${R}/knowledge`, { action: 'create', ...p }),
  updateKnowledge: (id: string, patch: Partial<RcpKnowledgeItem>) => post<{ item: RcpKnowledgeItem }>(`${R}/knowledge`, { action: 'update', id, ...patch }),
  deleteKnowledge: (id: string) => post<{ deleted: boolean }>(`${R}/knowledge`, { action: 'delete', id }),
};
