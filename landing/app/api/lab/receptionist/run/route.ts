import { NextResponse } from 'next/server';
import { guard, backendSend, degraded } from '@/lib/pixie-lab/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const A = '/api/agents/ai-receptionist';

/** Run the receptionist brain on a customer message (live console / continue a
 *  conversation). Tenant is resolved server-side. */
export async function POST(req: Request) {
  const g = await guard('receptionist.manage');
  if (!g.ok) return g.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const message = String(b.message || '').trim();
  if (!message) return NextResponse.json({ backendUp: true, error: 'A message is required' }, { status: 400 });
  const r = await backendSend('POST', `${A}/message`, g.tenant, {
    message,
    channel: b.channel || 'web_chat',
    conversation_id: b.conversation_id,
    name: b.name, email: b.email, phone: b.phone, company: b.company,
    campaign_id: b.campaign_id,
  }, undefined, 30000);
  if (!r.backendUp) return degraded({ error: 'The receptionist service is offline. Start the backend and try again.' });
  return NextResponse.json({ backendUp: true, ...(r.data as object) }, { status: r.status });
}
