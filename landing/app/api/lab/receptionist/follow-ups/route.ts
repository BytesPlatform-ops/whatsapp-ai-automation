import { NextResponse } from 'next/server';
import { guard, backendGet, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const A = '/api/agents/ai-receptionist';

/** GET follow-ups (tasks kind=follow_up) + reminders. POST { action:'cancel'|'retry', id }. */
export async function GET() {
  const g = await guard('receptionist.view');
  if (!g.ok) return g.response;
  const [tasks, reminders] = await Promise.all([
    backendGet(`${A}/tasks`, g.tenant, { kind: 'follow_up' }),
    backendGet(`${A}/reminders`, g.tenant),
  ]);
  if (!tasks.backendUp && !reminders.backendUp) return degraded();
  return NextResponse.json({
    backendUp: true,
    follow_ups: (tasks.data as { tasks?: unknown[] })?.tasks || [],
    reminders: (reminders.data as { reminders?: unknown[] })?.reminders || [],
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const g = await guard('receptionist.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(b.id || '');
  if (!id || (b.action !== 'cancel' && b.action !== 'retry'))
    return NextResponse.json({ backendUp: true, error: 'unsupported action' }, { status: 400 });
  // follow-up jobs are worker jobs; route the control through the worker endpoint
  const r = await backendSend('POST', `${A}/worker/jobs/${encodeURIComponent(id)}/${b.action}`, g.tenant, {});
  if (!r.backendUp) return degraded({ error: 'The receptionist service is offline.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
