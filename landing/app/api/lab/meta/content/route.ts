import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Marketing content library → Python `/api/meta/content` (published history) +
 * `/api/content/assets` (media library) for reads, and
 * `/api/agents/marketing/meta/prepare-post` to queue a post for approval.
 *   GET                                     published content + media assets (marketing.view)
 *   POST { action:'prepare-post', platform, content_type, idea, media_asset_id? }
 *                                           prepare a post for the approval queue (marketing.manage)
 */

export async function GET() {
  const g = await guard('marketing.view');
  if (!g.ok) return g.response;
  const [content, assets] = await Promise.all([
    backendGet('/api/meta/content', g.tenant),
    backendGet('/api/content/assets', g.tenant),
  ]);
  if (!content.backendUp && !assets.backendUp) return degraded({ content: [], assets: [] });
  return NextResponse.json(
    {
      backendUp: true,
      content: (content.data as { content?: unknown[] })?.content ?? [],
      assets: (assets.data as { assets?: unknown[] })?.assets ?? [],
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(req: Request) {
  const g = await guard('marketing.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (b.action !== 'prepare-post') return NextResponse.json({ backendUp: true, error: 'unknown action' }, { status: 400 });
  const r = await backendSend('POST', '/api/agents/marketing/meta/prepare-post', g.tenant, {
    platform: b.platform || 'instagram',
    content_type: b.content_type || 'reel',
    idea: b.idea || '',
    caption: b.caption || '',
    media_asset_id: b.media_asset_id || '',
  });
  if (!r.backendUp) return degraded({ error: 'The marketing service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
