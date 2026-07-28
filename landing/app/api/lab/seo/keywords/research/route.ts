import { NextResponse } from 'next/server';
import { guard, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Keyword research proxy — /api/lab/seo/keywords/research
 *
 * Backend route (seo/keywords/project_routes.py):
 *   POST /keywords/research
 *   Body: ResearchBody — requires seed_keyword (not 'seed') + project_id
 *
 * Note: backend field is `seed_keyword`, not `seed`.
 */
export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Accept both 'seed' (old client) and 'seed_keyword' (backend name)
  const seed_keyword = String(b.seed_keyword ?? b.seed ?? '');
  if (!seed_keyword) {
    return NextResponse.json({ backendUp: true, error: 'seed_keyword is required' }, { status: 400 });
  }
  const r = await backendSend('POST', '/api/agents/seo/keywords/research', g.tenant, {
    seed_keyword,
    project_id: b.project_id ?? '',
    country: b.country ?? 'us',
    language: b.language ?? 'en',
    domain: b.domain ?? '',
    volume_min: b.volume_min,
    volume_max: b.volume_max,
    difficulty_min: b.difficulty_min,
    difficulty_max: b.difficulty_max,
  });
  if (!r.backendUp) return degraded({ keywords: [], error: 'The SEO service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
