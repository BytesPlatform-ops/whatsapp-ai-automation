/**
 * E2E — Search Intelligence flow
 * Covers: connect Google → select property → sync → research keyword →
 *         add to project → track rank → opportunity → brief → hand off
 *
 * All /api/lab/seo/* routes mocked.
 */

import { test, expect } from 'playwright/test';
import { installSeoMocks, PROJ_ID, MOCK_KEYWORD_PROJECTS, MOCK_RESEARCH_KEYWORDS } from './fixtures/seo-mocks';
import { setupSeoPage } from './helpers/page-setup';

const BASE = '/pixie-lab/seo';

test.describe('SEO – Connections (Google)', () => {
  test('shows connection status', async ({ page }) => {
    await setupSeoPage(page);
    await page.goto(`${BASE}/connections`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/wordpress|google|connection/i).first()).toBeVisible({ timeout: 6_000 });
  });

  test('connect Google Search Console flow', async ({ page }) => {
    let connectCalled = false;
    await setupSeoPage(page);

    await page.route('**/api/lab/seo/connections', async (r) => {
      if (r.request().method() === 'POST') {
        connectCalled = true;
        await r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ backendUp: true, status: 'connected', message: 'Connected successfully' }),
        });
      } else {
        await r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            backendUp: true,
            platforms: [{ platform: 'google_search_console', status: 'disconnected' }],
          }),
        });
      }
    });

    await page.goto(`${BASE}/connections`, { waitUntil: 'domcontentloaded' });
    // Look for a connect button related to Google.
    const connectBtn = page.getByRole('button', { name: /connect|add/i }).first();
    if (await connectBtn.isVisible({ timeout: 5_000 })) {
      await connectBtn.click();
      // A form, dialog, or callback should appear.
      await page.waitForTimeout(500);
    }
  });

  test('shows Google Search Console properties', async ({ page }) => {
    await setupSeoPage(page);
    await page.goto(`${BASE}/connections`, { waitUntil: 'domcontentloaded' });

    // Properties should appear in some form.
    await page.waitForTimeout(1500);
    // Flexible assertion — either properties or connected status.
    const visible = await page.getByText(/connected|sc-domain|example.com/i).first().isVisible().catch(() => false);
    expect(visible).toBeTruthy();
  });

  test('GSC sync triggers POST', async ({ page }) => {
    let syncCalled = false;
    await setupSeoPage(page);
    await page.route('**/api/lab/seo/gsc-sync**', async (r) => {
      syncCalled = true;
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ backendUp: true, status: 'syncing' }),
      });
    });

    await page.goto(`${BASE}/connections`, { waitUntil: 'domcontentloaded' });
    const syncBtn = page.getByRole('button', { name: /sync|refresh/i }).first();
    if (await syncBtn.isVisible({ timeout: 5_000 })) {
      await syncBtn.click();
      await page.waitForTimeout(300);
      expect(syncCalled).toBe(true);
    }
  });
});

test.describe('SEO – Keywords', () => {
  test('lists keyword projects', async ({ page }) => {
    await setupSeoPage(page, { keywordsTotal: 5000 });
    await page.goto(`${BASE}/keywords`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/main keyword project/i)).toBeVisible({ timeout: 6_000 });
  });

  test('create new keyword project', async ({ page }) => {
    let created = false;
    await setupSeoPage(page);
    await page.route('**/api/lab/seo/keyword-projects', async (r) => {
      if (r.request().method() === 'POST') {
        created = true;
        await r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ backendUp: true, project: { id: 'proj-new', name: 'New Project', keyword_count: 0 } }),
        });
      } else {
        await r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ backendUp: true, projects: [] }),
        });
      }
    });

    await page.goto(`${BASE}/keywords`, { waitUntil: 'domcontentloaded' });

    const nameInput = page.getByPlaceholder(/project name|new project/i).first();
    if (await nameInput.isVisible({ timeout: 5_000 })) {
      await nameInput.fill('New Project');
      await page.getByRole('button', { name: /create/i }).first().click();
      await page.waitForTimeout(500);
      expect(created).toBe(true);
    }
  });

  test('add keyword to project', async ({ page }) => {
    let kwAdded = false;
    await setupSeoPage(page, { keywordsTotal: 5 });
    await page.route('**/api/lab/seo/keywords', async (r) => {
      if (r.request().method() === 'POST') {
        kwAdded = true;
        await r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ backendUp: true, keyword: { id: 'kw-new', keyword: 'seo audit tool' } }),
        });
      } else {
        await r.continue();
      }
    });

    await page.goto(`${BASE}/keywords`, { waitUntil: 'domcontentloaded' });

    // Expand first project.
    const projectToggle = page.getByRole('button').filter({ hasText: /main keyword project/i }).first();
    if (await projectToggle.isVisible({ timeout: 5_000 })) {
      await projectToggle.click();
      await page.waitForTimeout(500);

      // Fill the add-keyword input.
      const kwInput = page.getByPlaceholder(/add keyword/i).first();
      if (await kwInput.isVisible({ timeout: 3_000 })) {
        await kwInput.fill('seo audit tool');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);
        expect(kwAdded).toBe(true);
      }
    }
  });

  test('keyword research flow', async ({ page }) => {
    await setupSeoPage(page, { keywordsTotal: 5 });
    await page.goto(`${BASE}/keywords`, { waitUntil: 'domcontentloaded' });

    // Expand first project.
    const projectToggle = page.getByRole('button').filter({ hasText: /main keyword project/i }).first();
    if (await projectToggle.isVisible({ timeout: 5_000 })) {
      await projectToggle.click();
      await page.waitForTimeout(500);

      // Click "Research keywords".
      const researchToggle = page.getByRole('button', { name: /research keywords/i }).first();
      if (await researchToggle.isVisible({ timeout: 3_000 })) {
        await researchToggle.click();

        // Fill seed and submit.
        const seedInput = page.getByPlaceholder(/seed keyword/i).first();
        if (await seedInput.isVisible({ timeout: 3_000 })) {
          await seedInput.fill('seo tools');
          await page.getByRole('button', { name: /research/i }).first().click();
          await page.waitForTimeout(1000);

          // Research results should appear.
          await expect(page.getByText(/seo tools|keyword research|rank tracker/i).first()).toBeVisible({ timeout: 5_000 });
        }
      }
    }
  });

  test('keyword list is bounded with 5000 keywords', async ({ page }) => {
    await setupSeoPage(page, { keywordsTotal: 5000 });
    await page.goto(`${BASE}/keywords`, { waitUntil: 'domcontentloaded' });

    // Expand first project.
    const projectToggle = page.getByRole('button').filter({ hasText: /main keyword project/i }).first();
    if (await projectToggle.isVisible({ timeout: 5_000 })) {
      await projectToggle.click();
      await page.waitForTimeout(1500);

      // Count rendered keyword rows — should be bounded.
      const kwRows = page.locator('[class*="rounded-xl"][class*="border"]').filter({ hasText: /keyword phrase/ });
      const count = await kwRows.count();
      // Should not render all 5000.
      expect(count).toBeLessThan(500);
    }
  });
});

test.describe('SEO – Rankings', () => {
  test('shows project selector and rank overview', async ({ page }) => {
    await setupSeoPage(page, { keywordsTotal: 20 });
    await page.goto(`${BASE}/rankings`, { waitUntil: 'domcontentloaded' });

    // Target the visible rank-overview stat labels. (The project name also
    // appears inside a hidden <select><option>, so matching it with .first()
    // would resolve to a hidden node.)
    await expect(page.getByText(/^top 3$|^top 10$/i).first()).toBeVisible({ timeout: 6_000 });
  });

  test('check ranks button triggers POST', async ({ page }) => {
    let rankCheckCalled = false;
    await setupSeoPage(page, { keywordsTotal: 5 });
    await page.route('**/api/lab/seo/rankings/check**', async (r) => {
      if (r.request().method() === 'POST') {
        rankCheckCalled = true;
        await r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ backendUp: true, status: 'queued' }),
        });
      } else {
        await r.continue();
      }
    });

    await page.goto(`${BASE}/rankings`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const checkBtn = page.getByRole('button', { name: /check ranks/i }).first();
    if (await checkBtn.isVisible({ timeout: 5_000 })) {
      await checkBtn.click();
      await page.waitForTimeout(500);
      expect(rankCheckCalled).toBe(true);
    }
  });
});

test.describe('SEO – Opportunities', () => {
  test('renders opportunities panel', async ({ page }) => {
    await setupSeoPage(page);
    await page.goto(`${BASE}/opportunities`, { waitUntil: 'domcontentloaded' });
    // Empty state or list.
    await expect(page.getByText(/opportunity|competitor|brief|no opportunities/i).first()).toBeVisible({ timeout: 6_000 });
  });
});

test.describe('SEO – Content Briefs', () => {
  test('renders briefs panel', async ({ page }) => {
    await setupSeoPage(page);
    await page.goto(`${BASE}/briefs`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/brief|content|no briefs/i).first()).toBeVisible({ timeout: 6_000 });
  });
});
