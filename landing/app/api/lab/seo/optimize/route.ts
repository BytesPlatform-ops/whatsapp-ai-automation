import { NextResponse } from 'next/server';
import { guard, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SEO one-tap optimise → Python `/api/agents/seo/optimize/*` (seo.manage).
 *   POST { mode:'prepare', audit_id, issue_id, new_value? }  → copy-ready text or an approval
 *   POST { mode:'apply',  audit_id, issue_id, approval_id }  → execute an approved fix
 */
export async function POST(req: Request) {
  const g = await guard('seo.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const audit_id = String(b.audit_id || '');
  const issue_id = String(b.issue_id || '');
  if (!audit_id || !issue_id) return NextResponse.json({ backendUp: true, error: 'audit_id and issue_id required' }, { status: 400 });

  const apply = b.mode === 'apply';
  if (apply && !b.approval_id) return NextResponse.json({ backendUp: true, error: 'approval_id required to apply' }, { status: 400 });

  const path = apply ? '/api/agents/seo/optimize/apply' : '/api/agents/seo/optimize/prepare';
  const body = apply
    ? { audit_id, issue_id, approval_id: b.approval_id, new_value: b.new_value || '' }
    : { audit_id, issue_id, new_value: b.new_value || '' };

  const r = await backendSend('POST', path, g.tenant, body);
  if (!r.backendUp) return degraded({ error: 'The SEO service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
