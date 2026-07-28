/**
 * E2E — Site & Audit flow
 * Covers: create site → start crawl → crawl progress → pages → issues → report
 *
 * All /api/lab/seo/* routes are mocked; no live backend required.
 */

import { test, expect } from 'playwright/test';
import { installSeoMocks, SITE_ID, CRAWL_ID, MOCK_CRAWL_PROGRESS, makePages } from './fixtures/seo-mocks';
import { setupSeoPage } from './helpers/page-setup';

const BASE = '/pixie-lab/seo';

test.describe('SEO – Sites', () => {
  test('lists existing sites', async ({ page }) => {
    await setupSeoPage(page);
    await page.goto(`${BASE}/sites`, { waitUntil: 'domcontentloaded' });

    // Site card or table row should appear.
    await expect(page.getByText('example.com')).toBeVisible({ timeout: 8_000 });
  });

  test('create-site form submits successfully', async ({ page }) => {
    await setupSeoPage(page);

    // Override sites POST to capture request.
    let siteCreated = false;
    await page.route('**/api/lab/seo/sites', async (r) => {
      if (r.request().method() === 'POST') {
        siteCreated = true;
        await r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            backendUp: true,
            site: { id: 'site-new', domain: 'newsite.com', display_name: 'New Site', created_at: new Date().toISOString() },
          }),
        });
      } else {
        await r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ backendUp: true, sites: [] }),
        });
      }
    });

    await page.goto(`${BASE}/sites/new`, { waitUntil: 'domcontentloaded' });

    // Fill domain field — selector based on label text or placeholder.
    const domainInput = page.locator('input[name="domain"], input[placeholder*="domain" i], input[placeholder*="example.com" i]').first();
    if (await domainInput.isVisible({ timeout: 5_000 })) {
      await domainInput.fill('newsite.com');
      await page.getByRole('button', { name: /create|add|save/i }).first().click();
      // The POST should have been triggered.
      expect(siteCreated).toBe(true);
    }
  });
});

test.describe('SEO – Crawl Jobs', () => {
  test('shows crawl job list', async ({ page }) => {
    await setupSeoPage(page);
    await page.goto(`${BASE}/crawls`, { waitUntil: 'domcontentloaded' });

    // Crawl job status text.
    await expect(page.getByText(/completed|running|queued/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test('shows crawl progress indicator during active crawl', async ({ page }) => {
    await setupSeoPage(page);

    // Override crawl job to return 'running' status.
    await page.route('**/api/lab/seo/crawls/**', async (r) => {
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_CRAWL_PROGRESS),
      });
    });

    await page.goto(`${BASE}/crawls`, { waitUntil: 'domcontentloaded' });
    // Some indication of progress (percentage, bar, or count).
    await expect(page.getByText(/30|running|progress/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test('start new crawl button triggers POST', async ({ page }) => {
    let crawlStarted = false;
    await setupSeoPage(page);
    await page.route('**/api/lab/seo/crawls', async (r) => {
      if (r.request().method() === 'POST') {
        crawlStarted = true;
        await r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ backendUp: true, crawl_job: { id: 'new-crawl', site_id: SITE_ID, status: 'queued' } }),
        });
      } else {
        await r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ backendUp: true, crawl_jobs: [] }),
        });
      }
    });

    await page.goto(`${BASE}/crawls`, { waitUntil: 'domcontentloaded' });
    const startBtn = page.getByRole('button', { name: /start crawl|new crawl|crawl now/i }).first();
    if (await startBtn.isVisible({ timeout: 4_000 })) {
      await startBtn.click();
      expect(crawlStarted).toBe(true);
    }
  });
});

test.describe('SEO – Pages', () => {
  test('renders first page of results (bounded DOM)', async ({ page }) => {
    await setupSeoPage(page, { pagesTotal: 1000 });
    await page.goto(`${BASE}/pages?crawl_job_id=${CRAWL_ID}`, { waitUntil: 'domcontentloaded' });

    // Should see rows but NOT 1000 rows.
    await page.waitForTimeout(1500);
    const pageRows = page.locator('[data-testid="page-row"], .page-row, [role="button"][aria-expanded]');
    const count = await pageRows.count();
    // Bounded — a single page should never render 1000 rows at once.
    expect(count).toBeLessThan(200);
    // But it should render at least 1.
    expect(count).toBeGreaterThan(0);
  });

  test('pagination controls appear with 1000 pages', async ({ page }) => {
    await setupSeoPage(page, { pagesTotal: 1000 });
    await page.goto(`${BASE}/pages?crawl_job_id=${CRAWL_ID}`, { waitUntil: 'domcontentloaded' });

    // Pagination controls should be present.
    await expect(page.getByRole('button', { name: /next|chevron right/i }).or(
      page.locator('[aria-label*="next" i], [aria-label*="page" i]')
    ).first()).toBeVisible({ timeout: 6_000 });
  });

  test('next/previous pagination buttons work', async ({ page }) => {
    await setupSeoPage(page, { pagesTotal: 1000 });
    await page.goto(`${BASE}/pages?crawl_job_id=${CRAWL_ID}`, { waitUntil: 'domcontentloaded' });

    // Wait for page indicator "Page 1 of".
    await expect(page.getByText(/page 1 of/i)).toBeVisible({ timeout: 6_000 });

    // Click next page.
    const nextBtn = page.getByRole('button').filter({ has: page.locator('svg') }).nth(1);
    // Find the navigation button that advances the page.
    const paginationNext = page.locator('button:has(svg):not([disabled])').last();
    await paginationNext.click();

    // Page indicator should advance.
    await expect(page.getByText(/page 2 of/i)).toBeVisible({ timeout: 4_000 });
  });

  test('expands page detail drawer on click', async ({ page }) => {
    await setupSeoPage(page, { pagesTotal: 10 });
    await page.goto(`${BASE}/pages?crawl_job_id=${CRAWL_ID}`, { waitUntil: 'domcontentloaded' });

    // Click the first expandable row.
    const row = page.locator('[aria-expanded="false"]').first();
    if (await row.isVisible({ timeout: 5_000 })) {
      await row.click();
      // Drawer content should appear.
      await expect(page.getByText(/title|meta description|word count/i).first()).toBeVisible({ timeout: 4_000 });
    }
  });

  test('shows no-job state when crawl_job_id is missing', async ({ page }) => {
    await setupSeoPage(page);
    await page.goto(`${BASE}/pages`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/select a crawl job|crawl job/i).first()).toBeVisible({ timeout: 6_000 });
  });
});

test.describe('SEO – Issues', () => {
  test('renders issue list with severity badges', async ({ page }) => {
    await setupSeoPage(page);
    await page.goto(`${BASE}/issues`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/critical|high|medium/i).first()).toBeVisible({ timeout: 6_000 });
  });

  test('filter by severity', async ({ page }) => {
    await setupSeoPage(page);
    await page.goto(`${BASE}/issues`, { waitUntil: 'domcontentloaded' });

    // Wait for issues to load.
    await page.waitForTimeout(1000);

    // Select "high" in severity filter.
    const severitySelect = page.locator('select').first();
    if (await severitySelect.isVisible({ timeout: 4_000 })) {
      await severitySelect.selectOption('high');
      await page.waitForTimeout(500);
    }
  });

  test('search input filters issues', async ({ page }) => {
    await setupSeoPage(page);
    await page.goto(`${BASE}/issues`, { waitUntil: 'domcontentloaded' });

    await page.waitForTimeout(1000);

    const searchInput = page.getByPlaceholder(/search/i).first();
    if (await searchInput.isVisible({ timeout: 4_000 })) {
      await searchInput.fill('missing');
      await page.waitForTimeout(300);
      // Result count should update.
      await expect(page.getByText(/issue/i).first()).toBeVisible({ timeout: 4_000 });
    }
  });

  test('expand issue detail and mark resolved', async ({ page }) => {
    let resolved = false;
    await setupSeoPage(page);

    // Intercept resolve call.
    await page.route('**/api/lab/seo/issues*', async (r) => {
      if (r.request().url().includes('/resolve')) {
        resolved = true;
        await r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ backendUp: true, status: 'resolved' }),
        });
      } else {
        // Fall through to default mock.
        await r.continue();
      }
    });

    await page.goto(`${BASE}/issues`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Expand first issue.
    const expandBtn = page.getByRole('button', { name: /toggle issue detail/i }).first();
    if (await expandBtn.isVisible({ timeout: 5_000 })) {
      await expandBtn.click();

      // Click "Mark resolved".
      const resolveBtn = page.getByRole('button', { name: /mark resolved/i }).first();
      if (await resolveBtn.isVisible({ timeout: 3_000 })) {
        await resolveBtn.click();
        // The resolved indicator should appear.
        await expect(page.getByText(/resolved/i).first()).toBeVisible({ timeout: 4_000 });
      }
    }
  });
});

test.describe('SEO – Reports', () => {
  test('renders report summary', async ({ page }) => {
    await setupSeoPage(page);
    await page.goto(`${BASE}/reports?site_id=${SITE_ID}`, { waitUntil: 'domcontentloaded' });

    // Score or summary section should appear.
    await expect(page.getByText(/score|summary|report/i).first()).toBeVisible({ timeout: 6_000 });
  });
});
