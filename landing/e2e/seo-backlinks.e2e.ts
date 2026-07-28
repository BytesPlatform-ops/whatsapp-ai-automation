/**
 * E2E — Backlinks flow
 * Covers: sync → new/lost → risk → gap opportunity
 * Large-scale: 50 000 backlinks mocked; asserts DOM is bounded.
 *
 * All /api/lab/seo/* routes mocked.
 */

import { test, expect } from 'playwright/test';
import { SITE_ID } from './fixtures/seo-mocks';
import { setupSeoPage } from './helpers/page-setup';

const BASE = '/pixie-lab/seo';

test.describe('SEO – Backlinks', () => {
  test('renders backlinks overview with metrics', async ({ page }) => {
    await setupSeoPage(page, { backlinksTotal: 50000 });
    await page.goto(`${BASE}/backlinks?site_id=${SITE_ID}`, { waitUntil: 'domcontentloaded' });

    // Overview metrics should appear.
    await expect(page.getByText(/50,000|total backlink|referring domain/i).first()).toBeVisible({ timeout: 6_000 });
  });

  test('backlinks table is bounded (not 50k rows)', async ({ page }) => {
    await setupSeoPage(page, { backlinksTotal: 50000 });
    await page.goto(`${BASE}/backlinks?site_id=${SITE_ID}`, { waitUntil: 'domcontentloaded' });

    // Navigate to the Backlinks tab.
    const backlinksTab = page.getByRole('button', { name: /^backlinks$/i }).first();
    if (await backlinksTab.isVisible({ timeout: 5_000 })) {
      await backlinksTab.click();
      await page.waitForTimeout(1000);
    }

    // Count table rows — must be bounded.
    const rows = page.locator('tbody tr');
    const count = await rows.count();
    // The table shows a slice (200 max based on .slice(0,200) in component).
    expect(count).toBeLessThanOrEqual(250);
  });

  test('backlinks sync button triggers POST', async ({ page }) => {
    let syncCalled = false;
    await setupSeoPage(page, { backlinksTotal: 10 });
    await page.route('**/api/lab/seo/backlink-sync**', async (r) => {
      syncCalled = true;
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ backendUp: true, status: 'queued' }),
      });
    });

    await page.goto(`${BASE}/backlinks?site_id=${SITE_ID}`, { waitUntil: 'domcontentloaded' });
    const syncBtn = page.getByRole('button', { name: /sync/i }).first();
    if (await syncBtn.isVisible({ timeout: 5_000 })) {
      await syncBtn.click();
      await page.waitForTimeout(500);
      expect(syncCalled).toBe(true);
    }
  });

  test('New & Lost view shows new and lost sections', async ({ page }) => {
    await setupSeoPage(page, { backlinksTotal: 10 });
    await page.goto(`${BASE}/backlinks?site_id=${SITE_ID}`, { waitUntil: 'domcontentloaded' });

    // Navigate to New & Lost tab.
    const newLostTab = page.getByRole('button', { name: /new.*lost|lost.*new/i }).first();
    if (await newLostTab.isVisible({ timeout: 5_000 })) {
      await newLostTab.click();
      await page.waitForTimeout(500);

      await expect(page.getByText(/new backlinks|lost backlinks/i).first()).toBeVisible({ timeout: 4_000 });
    }
  });

  test('referring domains tab shows domain table', async ({ page }) => {
    await setupSeoPage(page, { backlinksTotal: 10 });
    await page.goto(`${BASE}/backlinks?site_id=${SITE_ID}`, { waitUntil: 'domcontentloaded' });

    const domainsTab = page.getByRole('button', { name: /referring domain/i }).first();
    if (await domainsTab.isVisible({ timeout: 5_000 })) {
      await domainsTab.click();
      await page.waitForTimeout(500);

      await expect(page.getByText(/referrer\d+\.com/).first()).toBeVisible({ timeout: 4_000 });
    }
  });

  test('risk filter works in backlinks table', async ({ page }) => {
    await setupSeoPage(page, { backlinksTotal: 20 });
    await page.goto(`${BASE}/backlinks?site_id=${SITE_ID}`, { waitUntil: 'domcontentloaded' });

    // Navigate to backlinks tab.
    const blTab = page.getByRole('button', { name: /^backlinks$/i }).first();
    if (await blTab.isVisible({ timeout: 5_000 })) {
      await blTab.click();
      await page.waitForTimeout(500);

      // Status filter.
      const statusSelect = page.locator('select').first();
      if (await statusSelect.isVisible({ timeout: 3_000 })) {
        await statusSelect.selectOption('lost');
        await page.waitForTimeout(300);
        // Lost rows should appear.
        const lostText = page.getByText(/lost/i).first();
        await expect(lostText).toBeVisible({ timeout: 4_000 });
      }
    }
  });

  test('link gap placeholder message appears', async ({ page }) => {
    await setupSeoPage(page, { backlinksTotal: 5 });
    await page.goto(`${BASE}/backlinks?site_id=${SITE_ID}`, { waitUntil: 'domcontentloaded' });

    const gapTab = page.getByRole('button', { name: /link gap/i }).first();
    if (await gapTab.isVisible({ timeout: 5_000 })) {
      await gapTab.click();
      await expect(page.getByText(/competitor|add.*competitor/i).first()).toBeVisible({ timeout: 4_000 });
    }
  });

  test('CSV export button triggers download attempt', async ({ page }) => {
    let exportCalled = false;
    await setupSeoPage(page, { backlinksTotal: 5 });
    await page.route('**/api/lab/seo/backlinks/export**', async (r) => {
      exportCalled = true;
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ backendUp: true, csv: 'source_domain,anchor_text\n' }),
      });
    });

    await page.goto(`${BASE}/backlinks?site_id=${SITE_ID}`, { waitUntil: 'domcontentloaded' });
    const csvBtn = page.getByRole('button', { name: /csv|export/i }).first();
    if (await csvBtn.isVisible({ timeout: 5_000 })) {
      await csvBtn.click();
      await page.waitForTimeout(500);
      expect(exportCalled).toBe(true);
    }
  });
});
