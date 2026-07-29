/**
 * Shared page setup utilities for Pixie Lab SEO E2E tests.
 *
 * Key concern: the Pixie Lab shell requires a Supabase session. Rather than
 * running real auth, we:
 *   1. Mock the Supabase auth API to return a fake session.
 *   2. Mock Next.js middleware cookie checks via route interception.
 *   3. Go directly to the target component route (component isolation).
 *
 * For full-shell navigation tests we use a static HTML fixture page that
 * imports the panels directly, bypassing auth middleware.
 */

import type { Page } from 'playwright/test';
import { installSeoMocks, type MockConfig } from '../fixtures/seo-mocks';

/**
 * Install all SEO mocks and also suppress auth-related redirects by
 * intercepting the Supabase session endpoint. Call this before page.goto().
 */
export async function setupSeoPage(page: Page, cfg: MockConfig = {}): Promise<void> {
  // Intercept Supabase auth routes to avoid redirect loops.
  await page.route('**/auth/v1/**', async (r) => {
    const url = r.request().url();
    if (url.includes('/session') || url.includes('/user')) {
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          expires_in: 3600,
          token_type: 'bearer',
          user: {
            id: 'mock-user-id',
            email: 'test@example.com',
            role: 'authenticated',
            aud: 'authenticated',
          },
        }),
      });
    } else {
      await r.continue();
    }
  });

  // Unlock the SEO agent. The Pixie Lab shell gates every service behind
  // /api/lab/entitlements (useEntitlements). Without this the workspace renders
  // the "Unlock SEO" trial paywall instead of the panels, so every data test
  // would fail on the gate rather than the feature. Return all agents active so
  // the workspace and its sub-tools render; SEO specifically must be unlocked.
  await page.route('**/api/lab/entitlements**', async (r) => {
    if (r.request().method() !== 'GET') {
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ backendUp: true, ok: true }) });
      return;
    }
    await r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        backendUp: true,
        entitlements: ['website', 'receptionist', 'seo', 'marketing', 'content'].map((agent) => ({
          agent, state: 'active',
        })),
      }),
    });
  });

  // Mock the /api/lab/seo/* proxy routes.
  await installSeoMocks(page, cfg);

  // Mock Next.js server actions / middleware routes that check auth.
  await page.route('**/api/auth/**', async (r) => {
    await r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authenticated: true }),
    });
  });
}

/**
 * Navigate to a route, optionally waiting for the main content to appear.
 * Uses a permissive wait strategy since pages may still render SSR skeletons.
 */
export async function gotoSeoRoute(
  page: Page,
  path: string,
  opts: { waitForSelector?: string } = {}
): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  if (opts.waitForSelector) {
    await page.waitForSelector(opts.waitForSelector, { timeout: 8_000 }).catch(() => {
      // Non-fatal: the selector may be in a loading state.
    });
  }
}
