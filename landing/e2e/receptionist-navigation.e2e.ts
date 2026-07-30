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
}

test.describe('Receptionist navigation', () => {
  const routes = ['', '/dashboard', '/conversations', '/crm', '/approvals', '/gmail', '/providers',
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
