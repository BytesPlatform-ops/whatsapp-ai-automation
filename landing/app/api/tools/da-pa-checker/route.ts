import { NextResponse } from 'next/server';
import { rateLimitCheck, getClientIp } from '@/lib/openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CheckRequest {
  domain: string;
}

interface CheckResponse {
  domain: string;
  found: boolean;
  authority: number; // 0–100, Open PageRank normalized (behaves like Domain Authority)
  pageRank: number; // raw Open PageRank, 0–10
  globalRank: number | null; // global rank position, lower = stronger
}

// Open PageRank — free, link-based authority dataset (Domcop).
// Docs: https://www.domcop.com/openpagerank/documentation
const OPR_ENDPOINT = 'https://openpagerank.com/api/v1.0/getPageRank';

interface OprEntry {
  status_code?: number;
  error?: string;
  page_rank_integer?: number;
  page_rank_decimal?: number;
  rank?: string | null;
  domain?: string;
}

interface OprResponse {
  status_code?: number;
  response?: OprEntry[];
}

// Strip protocol, path, query, and a leading "www." to get the bare host.
function normalizeDomain(input: string): string | null {
  let s = String(input ?? '').trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, '');
  s = s.split('/')[0].split('?')[0].split('#')[0];
  s = s.replace(/^www\./, '');
  s = s.replace(/:\d+$/, ''); // strip port
  // Must look like a domain: label(s) + dot + TLD, valid chars only.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) || s.length > 253) return null;
  return s;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export async function POST(req: Request): Promise<NextResponse<CheckResponse | { error: string }>> {
  const ip = getClientIp(req);
  const limit = rateLimitCheck(ip);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Retry in ${limit.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter ?? 60) } },
    );
  }

  let body: CheckRequest;
  try {
    body = (await req.json()) as CheckRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const domain = normalizeDomain(body.domain);
  if (!domain) {
    return NextResponse.json(
      { error: 'Please enter a valid domain, e.g. example.com' },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPEN_PAGERANK_API_KEY;
  if (!apiKey || apiKey === 'replace-me-with-your-open-pagerank-api-key') {
    return NextResponse.json({ error: 'Authority checker is not configured' }, { status: 500 });
  }

  const url = `${OPR_ENDPOINT}?domains%5B%5D=${encodeURIComponent(domain)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      headers: { 'API-OPR': apiKey },
      signal: controller.signal,
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Authority service is temporarily unavailable' }, { status: 502 });
    }

    const data = (await res.json()) as OprResponse;
    const entry = data.response?.[0];

    if (!entry || (entry.status_code && entry.status_code >= 400 && entry.status_code !== 404)) {
      return NextResponse.json({ error: 'Authority service is temporarily unavailable' }, { status: 502 });
    }

    const pageRank = typeof entry.page_rank_decimal === 'number' ? entry.page_rank_decimal : 0;
    const authority = clamp(Math.round(pageRank * 10), 0, 100);
    const rankNum = entry.rank != null ? Number(entry.rank) : NaN;
    const globalRank = Number.isFinite(rankNum) && rankNum > 0 ? rankNum : null;
    const found = pageRank > 0 || globalRank !== null;

    return NextResponse.json({ domain, found, authority, pageRank, globalRank });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return NextResponse.json(
      { error: aborted ? 'Authority service timed out — try again' : 'Authority service is temporarily unavailable' },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
