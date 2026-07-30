/**
 * E2E — AI Receptionist navigation + knowledge retrieval flow.
 *
 * All /api/lab/receptionist/* routes are mocked via page.route(); Supabase auth is
 * mocked the same way the SEO suite does. Requires the dev server on :3002
 * (webServer block in playwright.config.ts) — CI runs `npm run dev` first.
 *
 * Run:  cd landing && npx playwright test receptionist-navigation.e2e.ts
 */

import { test, expect, type Page } from 'playwright/test';

const BASE = '/pixie-lab/receptionist';

async function mockAuth(page: Page): Promise<void> {
  await page.route('**/auth/v1/**', async (r) => {
    const url = r.request().url();
    if (url.includes('/session') || url.includes('/user')) {
      await r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock', refresh_token: 'mock', expires_in: 3600, token_type: 'bearer',
          user: { id: 'mock-user-id', email: 'test@example.com', role: 'authenticated', aud: 'authenticated' },
        }),
      });
    } else { await r.continue(); }
  });
}

async function mockReceptionist(page: Page): Promise<void> {
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  // Entitlement gate → active, so the tool panels render (not the trial lock).
  await page.route('**/api/lab/entitlements**', async (r) => {
    await r.fulfill(json({ backendUp: true, entitlements: [
      { agent: 'receptionist', state: 'active', status: 'active' },
    ] }));
  });
  // Register the catch-all FIRST so the specific routes below take precedence
  // (Playwright uses the LAST-registered matching handler).
  await page.route('**/api/lab/receptionist/**', async (r) => {
    await r.fulfill(json({ backendUp: true, items: [], sources: [], conversations: [], leads: [], profile: {} }));
  });
  await page.route('**/api/lab/receptionist/knowledge-sources', async (r) => {
    if (r.request().method() === 'GET') {
      await r.fulfill(json({ backendUp: true, sources: [
        { id: 'ksrc_1', source_type: 'pdf', title: 'policy.pdf', index_status: 'indexed', chunk_count: 3, page_count: 2 },
      ] }));
    } else {
      await r.fulfill(json({ backendUp: true, source: { id: 'ksrc_2', source_type: 'text' } }));
    }
  });
  await page.route('**/api/lab/receptionist/knowledge/retrieval-test', async (r) => {
    await r.fulfill(json({ backendUp: true, confident: true, outcome: 'answer', method: 'structured_field',
      answer: 'We open 9am to 5pm', evidence: [{ source_id: 'profile:hours', chunk_id: 'hours', source_type: 'text',
        text: 'We open 9am to 5pm', score: 2.5, method: 'structured_field' }] }));
  });
  // Voice panel: status (default), ?view=numbers|calls.
  await page.route('**/api/lab/receptionist/voice**', async (r) => {
    const url = r.request().url();
    if (r.request().method() !== 'GET') { await r.fulfill(json({ backendUp: true, status: 'connected', account_id: 'org_1' })); return; }
    if (url.includes('view=numbers')) {
      await r.fulfill(json({ backendUp: true, numbers: [{ phone_number_id: 'pn_v1', number: '+15550009999', source: 'vapi', inbound_capable: true, outbound_capable: true }] }));
    } else if (url.includes('view=calls')) {
      await r.fulfill(json({ backendUp: true, calls: [] }));
    } else {
      await r.fulfill(json({ backendUp: true, inbound_enabled: true, outbound_enabled: false,
        recording_policy: { mode: 'no_recording', enabled: false }, transfer_destinations: [],
        connection: { connected: true, state: 'ready_for_inbound', account_id: 'org_1',
          inbound_enabled: true, outbound_enabled: false, recording_enabled: false, server_auth: true } }));
    }
  });
  // Telegram panel: status (default), ?view=drafts.
  await page.route('**/api/lab/receptionist/telegram**', async (r) => {
    const url = r.request().url();
    if (r.request().method() !== 'GET') { await r.fulfill(json({ backendUp: true, status: 'connected', bot: { bot_username: 'acme_bot' } })); return; }
    if (url.includes('view=drafts')) {
      await r.fulfill(json({ backendUp: true, drafts: [] }));
    } else {
      await r.fulfill(json({ backendUp: true, reply_mode: 'draft_only', business_reply_mode: 'draft_only',
        connection: { connected: true, state: 'standard_bot_ready', bot_username: 'acme_bot', bot_id: '111',
          webhook_subscribed: true, allowed_updates: ['message'], business_enabled: false,
          business: { state: 'business_mode_unavailable' } } }));
    }
  });
  // SMS panel: status (default), ?view=numbers|drafts.
  await page.route('**/api/lab/receptionist/sms**', async (r) => {
    const url = r.request().url();
    if (r.request().method() !== 'GET') { await r.fulfill(json({ backendUp: true, status: 'selected' })); return; }
    if (url.includes('view=numbers')) {
      await r.fulfill(json({ backendUp: true, numbers: [{ sender_number: '+15550001111', country: 'US', sms_capable: true, mms_capable: true }] }));
    } else if (url.includes('view=drafts')) {
      await r.fulfill(json({ backendUp: true, drafts: [] }));
    } else {
      await r.fulfill(json({ backendUp: true, reply_mode: 'draft_only',
        quiet_hours: { enabled: true, start_hour: 21, end_hour: 8, timezone: 'UTC' },
        connection: { connected: true, state: 'ready_to_send', sender_number: '+15550001111',
          country: 'US', sms_capable: true, mms_capable: true, can_send: true,
          inbound_webhook_subscribed: true, delivery_webhook_subscribed: true } }));
    }
  });
  // Meta Messaging panel: status (default), ?view=instagram-accounts|messenger-pages|drafts.
  await page.route('**/api/lab/receptionist/meta-messaging**', async (r) => {
    const url = r.request().url();
    if (r.request().method() !== 'GET') { await r.fulfill(json({ backendUp: true, status: 'selected' })); return; }
    if (url.includes('view=instagram-accounts')) {
      await r.fulfill(json({ backendUp: true, accounts: [{ instagram_account_id: 'ig_1', username: 'acme.co' }] }));
    } else if (url.includes('view=messenger-pages')) {
      await r.fulfill(json({ backendUp: true, pages: [{ page_id: 'page_1', page_name: 'Acme Ltd' }] }));
    } else if (url.includes('view=drafts')) {
      await r.fulfill(json({ backendUp: true, drafts: [] }));
    } else {
      await r.fulfill(json({ backendUp: true,
        instagram: { reply_mode: 'draft_only', connection: { connected: true, state: 'ready_for_replies',
          username: 'acme.co', instagram_account_id: 'ig_1', can_send: true, webhook_subscribed: true } },
        messenger: { reply_mode: 'draft_only', connection: { connected: true, state: 'ready_for_replies',
          page_id: 'page_1', page_name: 'Acme Ltd', can_send: true, webhook_subscribed: true } } }));
    }
  });
  // WhatsApp panel: status (default view), ?view=templates, ?view=drafts.
  await page.route('**/api/lab/receptionist/whatsapp**', async (r) => {
    const url = r.request().url();
    if (r.request().method() !== 'GET') { await r.fulfill(json({ backendUp: true, reply_mode: 'draft_only' })); return; }
    if (url.includes('view=templates')) {
      await r.fulfill(json({ backendUp: true, templates: [
        { name: 'appointment_reminder', language: 'en_US', category: 'UTILITY', status: 'APPROVED', variables: 2 }] }));
    } else if (url.includes('view=drafts')) {
      await r.fulfill(json({ backendUp: true, drafts: [] }));
    } else {
      await r.fulfill(json({ backendUp: true, reply_mode: 'draft_only', connection: {
        connected: true, display_phone_number: '+15551230000', waba_name: 'Acme',
        can_send: true, can_template: true, webhook_subscribed: true, state: 'ready_for_templates' } }));
    }
  });
}

test.describe('Receptionist navigation', () => {
  const routes = ['', '/dashboard', '/conversations', '/crm', '/approvals', '/gmail', '/whatsapp',
                  '/meta-messaging', '/sms', '/telegram', '/voice', '/providers',
                  '/calendar', '/bookings', '/followups', '/analytics', '/widget',
                  '/operations', '/integrations', '/knowledge'];
  for (const path of routes) {
    test(`direct navigation to ${path || '/'} renders without crash`, async ({ page }) => {
      await mockAuth(page);
      await mockReceptionist(page);
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      const body = await page.locator('body').textContent({ timeout: 8_000 });
      expect(body).not.toBeNull();
      expect(body!.length).toBeGreaterThan(5);
      expect(await page.locator('nextjs-portal, [id="__next-error"]').count()).toBe(0);
    });
  }
});

test.describe('Receptionist knowledge page', () => {
  test('knowledge page loads in-browser without crash', async ({ page }) => {
    await mockAuth(page);
    await mockReceptionist(page);
    await page.goto(`${BASE}/knowledge`, { waitUntil: 'domcontentloaded' });
    const body = await page.locator('body').textContent({ timeout: 8_000 });
    expect(body).not.toBeNull();
    expect(await page.locator('nextjs-portal, [id="__next-error"]').count()).toBe(0);
  });
});
// NOTE: the knowledge ingestion + retrieval-test panel behaviour (PDF/website add,
// evidence rendering, knowledge-gap state, error surfacing) is covered
// deterministically by the Vitest component test
// components/pixie-lab/receptionist/KnowledgeSourcesPanel.test.tsx, which mounts
// the panel directly without the entitlement gate.
