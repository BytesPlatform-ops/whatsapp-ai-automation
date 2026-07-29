import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Reviews proxy — /api/lab/seo/reviews
 *
 * Backend routes (seo/local/routes.py):
 *   GET  /locations/{location_id}/reviews           — list reviews
 *   POST /reviews/{review_id}/draft                 — AI-draft a reply
 *   PATCH /reviews/{review_id}/draft                — edit a drafted reply
 *   POST /reviews/{review_id}/approve               — approve a drafted reply
 *   POST /reviews/{review_id}/handled               — mark as handled
 *
 * GET  ?location_id= — list reviews for a location (seo.view)
 * POST { action: 'draft'|'approve'|'handled', review_id, ... } (seo.manage)
 *
 * FIELD-ALIAS NORMALISATION
 * The backend emits GBP-native field names (reviewer_display_name / review_text /
 * reply_text / reply_status) and wraps the summary in `workspace`, but the
 * frontend SeoReview type (serviceTypes.ts) + SeoReviewsPanel consume
 * author / body / response_draft / status and read `summary`. The draft endpoint
 * returns `draft_text` while the panel reads `draft`. We normalise both here so
 * neither side has to know the other's vocabulary and the panel never silently
 * renders blank cards.
 */

type BackendReview = {
  id: string;
  reviewer_display_name?: string | null;
  rating?: number | null;
  review_text?: string | null;
  created_at?: string;
  reply_text?: string | null;
  reply_status?: string | null;
  handled?: boolean;
  sentiment?: string | null;
  [k: string]: unknown;
};

/** Map backend reply_status/handled → the panel's answered|ignored|unanswered. */
function reviewStatus(r: BackendReview): 'answered' | 'ignored' | 'unanswered' {
  const rs = String(r.reply_status ?? '').toLowerCase();
  if (rs === 'approved' || rs === 'published') return 'answered';
  if (r.handled) return 'ignored';
  return 'unanswered';
}

/** Add frontend-friendly aliases while preserving the original backend fields. */
function normaliseReview(r: BackendReview): Record<string, unknown> {
  return {
    ...r,
    author: r.reviewer_display_name ?? null,
    body: r.review_text ?? null,
    response_draft: r.reply_text ?? null,
    status: reviewStatus(r),
  };
}

function normaliseListPayload(data: unknown): Record<string, unknown> {
  const d = (data ?? {}) as Record<string, unknown>;
  const reviews = Array.isArray(d.reviews) ? (d.reviews as BackendReview[]).map(normaliseReview) : [];
  const summary = (d.summary ?? d.workspace) as unknown;
  return { ...d, reviews, summary, workspace: d.workspace };
}

export async function GET(req: Request) {
  const g = await guard('seo.view');
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const location_id = searchParams.get('location_id');
  if (!location_id) {
    return NextResponse.json({ backendUp: true, error: 'location_id is required' }, { status: 400 });
  }
  const params: Record<string, string> = {};
  for (const [k, v] of searchParams.entries()) { if (k !== 'tenant_id' && k !== 'location_id') params[k] = v; }
  const r = await backendGet(`/api/agents/seo/locations/${encodeURIComponent(location_id)}/reviews`, g.tenant, Object.keys(params).length ? params : undefined);
  if (!r.backendUp) return degraded();
  return NextResponse.json({ backendUp: true, ...normaliseListPayload(r.data) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(b.action ?? 'draft');
  const review_id = String(b.review_id ?? '');
  if (!review_id) {
    return NextResponse.json({ backendUp: true, error: 'review_id is required' }, { status: 400 });
  }
  let path: string;
  if (action === 'approve') {
    path = `/api/agents/seo/reviews/${encodeURIComponent(review_id)}/approve`;
  } else if (action === 'handled') {
    path = `/api/agents/seo/reviews/${encodeURIComponent(review_id)}/handled`;
  } else {
    // default: draft
    path = `/api/agents/seo/reviews/${encodeURIComponent(review_id)}/draft`;
  }
  const r = await backendSend('POST', path, g.tenant, b);
  if (!r.backendUp) return degraded();
  const data = (r.data as Record<string, unknown> | null) ?? {};
  // Alias draft_text → draft so SeoReviewsPanel (reads env.draft) populates the editor.
  if (data.draft === undefined && data.draft_text !== undefined) {
    data.draft = data.draft_text;
  }
  return NextResponse.json({ backendUp: true, ...data }, { headers: { 'Cache-Control': 'no-store' } });
}
