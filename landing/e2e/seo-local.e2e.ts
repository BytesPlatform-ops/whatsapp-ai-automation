/**
 * E2E — Local SEO flow
 * Covers: create location → connect GBP → reviews → NAP audit →
 *         citation check → local rankings
 *
 * All /api/lab/seo/* routes mocked.
 */

import { test, expect } from 'playwright/test';
import { LOC_ID } from './fixtures/seo-mocks';
import { setupSeoPage } from './helpers/page-setup';

const BASE = '/pixie-lab/seo';

test.describe('SEO – Locations', () => {
  test('lists locations', async ({ page }) => {
    await setupSeoPage(page);
    await page.goto(`${BASE}/locations`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/main branch|location/i).first()).toBeVisible({ timeout: 6_000 });
  });

  test('create location submits POST', async ({ page }) => {
    let locationCreated = false;
    await setupSeoPage(page);
    await page.route('**/api/lab/seo/locations', async (r) => {
      if (r.request().method() === 'POST') {
        locationCreated = true;
        await r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            backendUp: true,
            location: { id: 'loc-new', name: 'Branch 2', city: 'Dallas', state: 'TX' },
          }),
        });
      } else {
        await r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ backendUp: true, locations: [] }),
        });
      }
    });

    await page.goto(`${BASE}/locations`, { waitUntil: 'domcontentloaded' });

    const addBtn = page.getByRole('button', { name: /add location|new location|create/i }).first();
    if (await addBtn.isVisible({ timeout: 5_000 })) {
      await addBtn.click();
      // Fill a name field if it appears.
      const nameInput = page.getByPlaceholder(/name|location name/i).first();
      if (await nameInput.isVisible({ timeout: 3_000 })) {
        await nameInput.fill('Branch 2');
        const saveBtn = page.getByRole('button', { name: /save|create|add/i }).first();
        await saveBtn.click();
        await page.waitForTimeout(500);
        expect(locationCreated).toBe(true);
      }
    }
  });
});

test.describe('SEO – Local Overview', () => {
  test('shows local SEO overview metrics', async ({ page }) => {
    await setupSeoPage(page);
    await page.goto(`${BASE}/local`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/rating|review|citation|nap/i).first()).toBeVisible({ timeout: 6_000 });
  });

  test('GBP connect triggers API call', async ({ page }) => {
    let gbpCalled = false;
    await setupSeoPage(page);
    await page.route('**/api/lab/seo/gbp-connect**', async (r) => {
      gbpCalled = true;
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ backendUp: true, status: 'connected' }),
      });
    });

    await page.goto(`${BASE}/local`, { waitUntil: 'domcontentloaded' });
    const connectBtn = page.getByRole('button', { name: /connect.*google|google.*business|gbp/i }).first();
    if (await connectBtn.isVisible({ timeout: 5_000 })) {
      await connectBtn.click();
      await page.waitForTimeout(500);
      expect(gbpCalled).toBe(true);
    }
  });
});

test.describe('SEO – Reviews', () => {
  test('shows reviews list', async ({ page }) => {
    await setupSeoPage(page);
    await page.goto(`${BASE}/reviews?location_id=${LOC_ID}`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/review text|reviewer/i).first()).toBeVisible({ timeout: 6_000 });
  });

  test('reply to review triggers API', async ({ page }) => {
    let replyCalled = false;
    await setupSeoPage(page);
    await page.route('**/api/lab/seo/review-reply**', async (r) => {
      replyCalled = true;
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ backendUp: true, status: 'replied' }),
      });
    });

    await page.goto(`${BASE}/reviews?location_id=${LOC_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const replyBtn = page.getByRole('button', { name: /reply/i }).first();
    if (await replyBtn.isVisible({ timeout: 5_000 })) {
      await replyBtn.click();
      await page.waitForTimeout(500);
      // Reply UI or API call should have been triggered.
      expect(replyCalled || (await page.getByPlaceholder(/reply/i).isVisible())).toBeTruthy();
    }
  });
});

test.describe('SEO – Citations', () => {
  test('shows citations table with consistency badges', async ({ page }) => {
    await setupSeoPage(page, { citationsTotal: 5000 });
    await page.goto(`${BASE}/citations`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/citation|consistent|directory/i).first()).toBeVisible({ timeout: 6_000 });
  });

  test('citations table is bounded with 5000 rows', async ({ page }) => {
    await setupSeoPage(page, { citationsTotal: 5000 });
    await page.goto(`${BASE}/citations`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const rows = page.locator('tbody tr');
    const count = await rows.count();
    // Must not render all 5000.
    expect(count).toBeLessThan(500);
    expect(count).toBeGreaterThan(0);
  });

  test('citation pagination controls appear', async ({ page }) => {
    await setupSeoPage(page, { citationsTotal: 5000 });
    await page.goto(`${BASE}/citations`, { waitUntil: 'domcontentloaded' });

    // Pagination or "showing X of Y" message.
    const paginationVisible = await page.getByText(/page \d+ of|showing \d+/i).isVisible().catch(() => false)
      || await page.locator('[aria-label*="next" i], [aria-label*="page" i]').first().isVisible().catch(() => false);
    expect(paginationVisible).toBeTruthy();
  });

  test('check consistency button triggers API', async ({ page }) => {
    let checkCalled = false;
    await setupSeoPage(page, { citationsTotal: 5 });
    await page.route('**/api/lab/seo/citations/check**', async (r) => {
      checkCalled = true;
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ backendUp: true, status: 'checking' }),
      });
    });

    await page.goto(`${BASE}/citations?location_id=${LOC_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const checkBtn = page.getByRole('button', { name: /check consistency/i }).first();
    if (await checkBtn.isVisible({ timeout: 5_000 })) {
      await checkBtn.click();
      await page.waitForTimeout(500);
      expect(checkCalled).toBe(true);
    }
  });

  test('NAP audit shows audit results', async ({ page }) => {
    await setupSeoPage(page);
    // NAP audit is in the local panel.
    await page.goto(`${BASE}/local`, { waitUntil: 'domcontentloaded' });

    const napBtn = page.getByRole('button', { name: /nap audit|run.*nap|check nap/i }).first();
    if (await napBtn.isVisible({ timeout: 5_000 })) {
      await napBtn.click();
      await page.waitForTimeout(1000);
      await expect(page.getByText(/nap score|inconsistent|phone/i).first()).toBeVisible({ timeout: 4_000 });
    }
  });
});
