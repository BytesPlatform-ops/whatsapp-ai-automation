/**
 * Receptionist Route Contract Tests (Wave 6, Part 12).
 *
 * Asserts that every implemented backend capability has a Next.js proxy under
 * /api/lab/receptionist/*, that each proxy:
 *   - forwards to a KNOWN backend endpoint,
 *   - derives the tenant server-side via guard() (never trusts a client tenant),
 *   - attaches the internal secret (via the shared backend helper),
 *   - has no fake/mock fallback JSON.
 *
 * Required result: Receptionist proxy gaps: 0.
 *
 * Run:  cd landing && npx vitest run lib/pixie-lab/__tests__/receptionistRouteContract.test.ts
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROXY_ROOT = resolve(HERE, '../../../app/api/lab/receptionist');

// Backend endpoints the receptionist surface exposes (console_api + ops_api + shared approvals).
const KNOWN_BACKEND = new Set<string>([
  '/api/agents/ai-receptionist/conversations',
  '/api/agents/ai-receptionist/leads',
  '/api/agents/ai-receptionist/bookings',
  '/api/agents/ai-receptionist/quotes',
  '/api/agents/ai-receptionist/tasks',
  '/api/agents/ai-receptionist/tickets',
  '/api/agents/ai-receptionist/reminders',
  '/api/agents/ai-receptionist/payments',
  '/api/agents/ai-receptionist/campaigns',
  '/api/agents/ai-receptionist/business-profile',
  '/api/agents/ai-receptionist/knowledge',
  '/api/agents/ai-receptionist/knowledge-sources',
  '/api/agents/ai-receptionist/knowledge/retrieval-test',
  '/api/agents/ai-receptionist/config',
  '/api/agents/ai-receptionist/config/versions',
  '/api/agents/ai-receptionist/config/rollback',
  '/api/agents/ai-receptionist/config/preview',
  '/api/agents/ai-receptionist/worker/health',
  '/api/agents/ai-receptionist/worker/jobs',
  '/api/agents/ai-receptionist/usage',
  '/api/agents/ai-receptionist/limits',
  '/api/agents/ai-receptionist/analytics/range',
  '/api/agents/ai-receptionist/escalations',
  '/api/agents/ai-receptionist/callbacks',
  '/api/agents/ai-receptionist/voicemails',
  '/api/agents/ai-receptionist/waitlist',
  '/api/agents/ai-receptionist/opt-outs',
  '/api/agents/ai-receptionist/overview',
  '/api/agents/ai-receptionist/health',
  '/api/agents/ai-receptionist/capabilities',
  '/api/agents/ai-receptionist/message',
  '/api/agents/ai-receptionist/integrations/status',
  '/api/agents/ai-receptionist/integrations/test',
  '/api/agents/ai-receptionist/run',
  // Wave 8: Gmail / Calendar / Widget provider endpoints
  '/api/agents/ai-receptionist/gmail/status',
  '/api/agents/ai-receptionist/gmail/settings',
  '/api/agents/ai-receptionist/gmail/sync',
  '/api/agents/ai-receptionist/gmail/drafts',
  '/api/agents/ai-receptionist/calendar/status',
  '/api/agents/ai-receptionist/calendar/list',
  '/api/agents/ai-receptionist/calendar/config',
  '/api/agents/ai-receptionist/calendar/availability',
  '/api/agents/ai-receptionist/calendar/bookings',
  '/api/agents/ai-receptionist/widget/config',
  '/api/agents/ai-receptionist/widget/verification',
  '/api/agents/ai-receptionist/widget/verify',
  // Wave 12: WhatsApp provider endpoints
  '/api/agents/ai-receptionist/whatsapp/status',
  '/api/agents/ai-receptionist/whatsapp/wabas',
  '/api/agents/ai-receptionist/whatsapp/phone-numbers',
  '/api/agents/ai-receptionist/whatsapp/settings',
  '/api/agents/ai-receptionist/whatsapp/templates',
  '/api/agents/ai-receptionist/whatsapp/drafts',
  // Wave 13: Meta Messaging (Instagram + Messenger) endpoints
  '/api/agents/ai-receptionist/meta-messaging/status',
  '/api/agents/ai-receptionist/meta-messaging/instagram',
  '/api/agents/ai-receptionist/meta-messaging/messenger',
  '/api/agents/ai-receptionist/meta-messaging/select',
  '/api/agents/ai-receptionist/meta-messaging/settings',
  '/api/agents/ai-receptionist/meta-messaging/drafts',
  '/api/agents/ai-receptionist/meta-messaging/test',
  '/api/agents/ai-receptionist/meta-messaging/health',
  '/api/agents/ai-receptionist/meta-messaging/disconnect',
  // Wave 14: SMS endpoints
  '/api/agents/ai-receptionist/sms/status',
  '/api/agents/ai-receptionist/sms/numbers',
  '/api/agents/ai-receptionist/sms/select',
  '/api/agents/ai-receptionist/sms/settings',
  '/api/agents/ai-receptionist/sms/quiet-hours',
  '/api/agents/ai-receptionist/sms/drafts',
  '/api/agents/ai-receptionist/sms/test',
  '/api/agents/ai-receptionist/sms/health',
  '/api/agents/ai-receptionist/sms/disconnect',
  // Wave 15: Telegram endpoints
  '/api/agents/ai-receptionist/telegram/status',
  '/api/agents/ai-receptionist/telegram/webhook-info',
  '/api/agents/ai-receptionist/telegram/connect',
  '/api/agents/ai-receptionist/telegram/validate',
  '/api/agents/ai-receptionist/telegram/webhook',
  '/api/agents/ai-receptionist/telegram/business',
  '/api/agents/ai-receptionist/telegram/mode',
  '/api/agents/ai-receptionist/telegram/settings',
  '/api/agents/ai-receptionist/telegram/drafts',
  '/api/agents/ai-receptionist/telegram/test',
  '/api/agents/ai-receptionist/telegram/health',
  '/api/agents/ai-receptionist/telegram/disconnect',
  // Wave 16: Voice / telephony endpoints
  '/api/agents/ai-receptionist/voice/status',
  '/api/agents/ai-receptionist/voice/numbers',
  '/api/agents/ai-receptionist/voice/calls',
  '/api/agents/ai-receptionist/voice/assistant',
  '/api/agents/ai-receptionist/voice/connect',
  '/api/agents/ai-receptionist/voice/validate',
  '/api/agents/ai-receptionist/voice/settings',
  '/api/agents/ai-receptionist/voice/callbacks',
  '/api/agents/ai-receptionist/voice/health',
  '/api/agents/ai-receptionist/voice/disconnect',
  // Wave 17: Advanced outbound campaigns
  '/api/agents/ai-receptionist/outbound-campaigns',
  '/api/approvals',
]);

// Every capability the operator UI needs → the proxy file that must exist.
const REQUIRED_PROXIES: string[] = [
  'conversations/route.ts',
  'leads/route.ts',
  'bookings/route.ts',
  'quotes/route.ts',
  'tasks/route.ts',
  'tickets/route.ts',
  'payments/route.ts',
  'campaigns/route.ts',
  'business-profile/route.ts',
  'knowledge/route.ts',
  'knowledge-sources/route.ts',
  'knowledge-sources/pdf/route.ts',
  'knowledge/retrieval-test/route.ts',
  'config/route.ts',
  'worker/route.ts',
  'usage/route.ts',
  'limits/route.ts',
  'analytics/route.ts',
  'approvals/route.ts',
  'follow-ups/route.ts',
  'health/route.ts',
  'overview/route.ts',
  'integrations/route.ts',
  'gmail/route.ts',
  'calendar/route.ts',
  'widget/route.ts',
  'whatsapp/route.ts',
  'meta-messaging/route.ts',
  'sms/route.ts',
  'telegram/route.ts',
  'voice/route.ts',
  'outbound-campaigns/route.ts',
];

function read(file: string): string {
  return readFileSync(resolve(PROXY_ROOT, file), 'utf8');
}

const A = '/api/agents/ai-receptionist';

// Extract the backend base paths a proxy forwards to. We capture the leading
// static segments of each backend reference (ignoring dynamic ${id} tails and
// trailing action verbs) so the contract can match them against KNOWN_BACKEND.
function backendPathsIn(src: string): string[] {
  const paths = new Set<string>();
  // `${A}/seg1[/seg2...]` — keep static leading segments up to a ${...} or verb.
  for (const m of src.matchAll(/\$\{A\}\/([a-zA-Z0-9_\-/]+)/g)) {
    const segs = m[1].split('/').filter(Boolean);
    if (segs.length) paths.add(`${A}/${segs.slice(0, 2).join('/')}`);
  }
  // absolute '/api/...' literals (e.g. shared approvals router)
  for (const m of src.matchAll(/['"`](\/api\/[a-zA-Z0-9_\-/]+)['"`]/g)) {
    if (!m[1].startsWith('/api/lab')) paths.add(m[1]);
  }
  return [...paths];
}

describe('receptionist route contract', () => {
  it('every required proxy exists → proxy gaps: 0', () => {
    const missing = REQUIRED_PROXIES.filter((p) => !existsSync(resolve(PROXY_ROOT, p)));
    expect(missing, `missing proxies: ${missing.join(', ')}`).toEqual([]);
  });

  it('every proxy derives the tenant via guard() (no client tenant trust)', () => {
    for (const p of REQUIRED_PROXIES) {
      const src = read(p);
      expect(src, `${p} must call guard()`).toMatch(/guard\(['"]receptionist\.(view|manage)['"]\)/);
      // must not read a tenant from the client request
      expect(src, `${p} must not read client tenant`).not.toMatch(/searchParams\.get\(['"]tenant/);
      expect(src, `${p} must not read body.tenant`).not.toMatch(/\bb\.tenant_id\b|body\.tenant_id/);
    }
  });

  it('every proxy attaches the internal secret via the shared backend helper', () => {
    for (const p of REQUIRED_PROXIES) {
      const src = read(p);
      expect(src, `${p} must import the shared backend helper`).toMatch(/@\/lib\/pixie-lab\/backend/);
    }
  });

  it('no proxy references an unknown backend endpoint', () => {
    for (const p of REQUIRED_PROXIES) {
      const src = read(p);
      for (const path of backendPathsIn(src)) {
        // known if it exactly matches, is a prefix of, or extends a known endpoint
        const known =
          KNOWN_BACKEND.has(path) ||
          [...KNOWN_BACKEND].some((k) => path === k || path.startsWith(k + '/') || k.startsWith(path + '/'));
        expect(known, `${p}: unknown backend path ${path}`).toBe(true);
      }
    }
  });

  it('no proxy returns fake/mock fallback data', () => {
    for (const p of REQUIRED_PROXIES) {
      const src = read(p);
      expect(src, `${p} must not contain mock fallback`).not.toMatch(/mockData|FAKE_|sampleRows|hardcoded/i);
    }
  });
});
