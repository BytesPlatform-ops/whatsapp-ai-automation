'use client';

// Shared helpers for the Meta Marketing pages. Everything routes through the
// same-origin /api/test-proxy → FastAPI backend (no CORS, central base URL).

export interface ProxyResult {
  ok: boolean;
  status: number;
  ms: number;
  data?: any;
  error?: string;
}

export async function callProxy(baseUrl: string, method: string, path: string, body?: unknown): Promise<ProxyResult> {
  const res = await fetch('/api/test-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl: baseUrl || undefined, method, path, body }),
  });
  return (await res.json()) as ProxyResult;
}

export const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
  padding: 20,
};
export const input: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  padding: '8px 10px',
  color: 'white',
  width: '100%',
  fontSize: 14,
};
export const h3: React.CSSProperties = { fontSize: 15, fontWeight: 700, margin: '0 0 12px' };

export function btn(bg: string): React.CSSProperties {
  return { background: bg, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '7px 14px', color: 'white', cursor: 'pointer', fontSize: 13 };
}

export const STATUS_COLOR: Record<string, string> = {
  new: '#93c5fd', analyzed: '#c7d2fe', reply_prepared: '#fcd34d', pending_approval: '#fcd34d',
  replied: '#6ee7b7', published: '#6ee7b7', mock_published: '#93c5fd', routed: '#a5b4fc',
  skipped: 'rgba(255,255,255,0.5)', blocked: '#fda4af', failed: '#fda4af', uploaded: '#93c5fd',
  executed: '#6ee7b7', pending: '#fcd34d',
};
export const SENTIMENT_COLOR: Record<string, string> = {
  positive: '#6ee7b7', neutral: '#93c5fd', negative: '#fda4af', angry: '#fca5a5', spam: '#d1d5db',
};
export const PERM_COLOR: Record<string, string> = {
  available: '#6ee7b7', missing: '#fda4af', app_review_needed: '#fcd34d',
};

export function mediaSrc(baseUrl: string, url: string): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${(baseUrl || 'http://localhost:8000').replace(/\/+$/, '')}${url}`;
}

// A compact header row every Meta page shares: title + tenant/baseUrl + honesty chips.
export interface MetaHeaderState {
  tenant: string;
  baseUrl: string;
  status: any;
  storage: any;
}
