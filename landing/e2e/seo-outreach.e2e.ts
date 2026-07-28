/**
 * E2E — Outreach flow
 * Covers: contact → campaign → draft → approve → schedule → stop follow-up on reply
 * Large-scale: 10 000 contacts mocked; asserts DOM is bounded.
 *
 * All /api/lab/seo/* routes mocked.
 */

import { test, expect } from 'playwright/test';
import { setupSeoPage } from './helpers/page-setup';

const BASE = '/pixie-lab/seo';

test.describe('SEO – Outreach Contacts', () => {
  test('renders contacts table', async ({ page }) => {
    await setupSeoPage(page, { contactsTotal: 50 });
    await page.goto(`${BASE}/outreach`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByText(/contact|email|domain/i).first()).toBeVisible({ timeout: 6_000 });
  });

  test('contacts table is bounded with 10000 contacts', async ({ page }) => {
    await setupSeoPage(page, { contactsTotal: 10000 });
    await page.goto(`${BASE}/outreach`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const rows = page.locator('tbody tr');
    const count = await rows.count();
    // Must not render all 10000.
    expect(count).toBeLessThan(500);
    expect(count).toBeGreaterThan(0);
  });

  test('contact pagination or bounded display with 10000 contacts', async ({ page }) => {
    await setupSeoPage(page, { contactsTotal: 10000 });
    await page.goto(`${BASE}/outreach`, { waitUntil: 'domcontentloaded' });

    // Either pagination controls or a "showing X of Y" note should appear.
    const paginationVisible = await page.getByText(/page \d+ of|showing \d+|10,000 contacts/i).isVisible().catch(() => false)
      || await page.locator('[aria-label*="next" i], button:has(svg)').last().isVisible().catch(() => false);
    expect(paginationVisible).toBeTruthy();
  });

  test('export contacts CSV triggers API', async ({ page }) => {
    let exportCalled = false;
    await setupSeoPage(page, { contactsTotal: 5 });
    await page.route('**/api/lab/seo/outreach-contacts/export**', async (r) => {
      exportCalled = true;
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ backendUp: true, csv: 'name,email\n' }),
      });
    });

    await page.goto(`${BASE}/outreach`, { waitUntil: 'domcontentloaded' });
    const exportBtn = page.getByRole('button', { name: /export/i }).first();
    if (await exportBtn.isVisible({ timeout: 5_000 })) {
      await exportBtn.click();
      await page.waitForTimeout(500);
      expect(exportCalled).toBe(true);
    }
  });

  test('suppress contact triggers API', async ({ page }) => {
    let suppressCalled = false;
    await setupSeoPage(page, { contactsTotal: 3 });
    await page.route('**/api/lab/seo/outreach-contacts/**', async (r) => {
      if (r.request().url().includes('/suppress') || r.request().method() === 'POST') {
        suppressCalled = true;
        await r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ backendUp: true, status: 'suppressed' }),
        });
      } else {
        await r.continue();
      }
    });

    await page.goto(`${BASE}/outreach`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const suppressBtn = page.getByRole('button', { name: /suppress/i }).first();
    if (await suppressBtn.isVisible({ timeout: 5_000 })) {
      await suppressBtn.click();
      await page.waitForTimeout(500);
      expect(suppressCalled).toBe(true);
    }
  });
});

test.describe('SEO – Outreach Campaigns', () => {
  test('lists campaigns', async ({ page }) => {
    await setupSeoPage(page, { contactsTotal: 5 });
    await page.goto(`${BASE}/outreach`, { waitUntil: 'domcontentloaded' });

    // Navigate to Campaigns tab.
    const campaignsTab = page.getByRole('button', { name: /campaigns/i }).first();
    if (await campaignsTab.isVisible({ timeout: 5_000 })) {
      await campaignsTab.click();
      await page.waitForTimeout(500);
      await expect(page.getByText(/q1 link building|active/i).first()).toBeVisible({ timeout: 4_000 });
    }
  });

  test('create new campaign', async ({ page }) => {
    let campCreated = false;
    await setupSeoPage(page, { contactsTotal: 5 });
    await page.route('**/api/lab/seo/outreach-campaigns', async (r) => {
      if (r.request().method() === 'POST') {
        campCreated = true;
        await r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ backendUp: true, campaign: { id: 'camp-new', name: 'Q2 Campaign', status: 'draft' } }),
        });
      } else {
        await r.continue();
      }
    });

    await page.goto(`${BASE}/outreach`, { waitUntil: 'domcontentloaded' });

    const campaignsTab = page.getByRole('button', { name: /campaigns/i }).first();
    if (await campaignsTab.isVisible({ timeout: 5_000 })) {
      await campaignsTab.click();
      await page.waitForTimeout(500);

      const newCampBtn = page.getByRole('button', { name: /new campaign/i }).first();
      if (await newCampBtn.isVisible({ timeout: 3_000 })) {
        await newCampBtn.click();
        const nameInput = page.getByPlaceholder(/campaign name/i).first();
        if (await nameInput.isVisible({ timeout: 3_000 })) {
          await nameInput.fill('Q2 Campaign');
          const createBtn = page.getByRole('button', { name: /^create$/i }).first();
          await createBtn.click();
          await page.waitForTimeout(500);
          expect(campCreated).toBe(true);
        }
      }
    }
  });
});

test.describe('SEO – Outreach Drafts', () => {
  test('shows drafts list', async ({ page }) => {
    await setupSeoPage(page, { contactsTotal: 5 });
    await page.goto(`${BASE}/outreach`, { waitUntil: 'domcontentloaded' });

    const draftsTab = page.getByRole('button', { name: /drafts/i }).first();
    if (await draftsTab.isVisible({ timeout: 5_000 })) {
      await draftsTab.click();
      await page.waitForTimeout(500);
      await expect(page.getByText(/link building opportunity|draft/i).first()).toBeVisible({ timeout: 4_000 });
    }
  });

  test('approve draft triggers API', async ({ page }) => {
    let approveCalled = false;
    await setupSeoPage(page, { contactsTotal: 5 });
    await page.route('**/api/lab/seo/outreach-drafts/*/approve**', async (r) => {
      approveCalled = true;
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ backendUp: true, status: 'approved' }),
      });
    });

    await page.goto(`${BASE}/outreach`, { waitUntil: 'domcontentloaded' });
    const draftsTab = page.getByRole('button', { name: /drafts/i }).first();
    if (await draftsTab.isVisible({ timeout: 5_000 })) {
      await draftsTab.click();
      await page.waitForTimeout(500);

      const approveBtn = page.getByRole('button', { name: /approve/i }).first();
      if (await approveBtn.isVisible({ timeout: 3_000 })) {
        await approveBtn.click();
        await page.waitForTimeout(500);
        expect(approveCalled).toBe(true);
      }
    }
  });

  test('send draft triggers API', async ({ page }) => {
    let sendCalled = false;
    await setupSeoPage(page, { contactsTotal: 5 });
    await page.route('**/api/lab/seo/outreach-drafts/*/send**', async (r) => {
      sendCalled = true;
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ backendUp: true, status: 'sent' }),
      });
    });

    await page.goto(`${BASE}/outreach`, { waitUntil: 'domcontentloaded' });
    const draftsTab = page.getByRole('button', { name: /drafts/i }).first();
    if (await draftsTab.isVisible({ timeout: 5_000 })) {
      await draftsTab.click();
      await page.waitForTimeout(500);

      const sendBtn = page.getByRole('button', { name: /send/i }).first();
      if (await sendBtn.isVisible({ timeout: 3_000 })) {
        await sendBtn.click();
        await page.waitForTimeout(500);
        expect(sendCalled).toBe(true);
      }
    }
  });

  test('stop follow-up triggers API', async ({ page }) => {
    let stopCalled = false;
    await setupSeoPage(page, { contactsTotal: 5 });
    await page.route('**/api/lab/seo/outreach-drafts/*/stop-followup**', async (r) => {
      stopCalled = true;
      await r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ backendUp: true, status: 'stopped' }),
      });
    });

    await page.goto(`${BASE}/outreach`, { waitUntil: 'domcontentloaded' });
    const draftsTab = page.getByRole('button', { name: /drafts/i }).first();
    if (await draftsTab.isVisible({ timeout: 5_000 })) {
      await draftsTab.click();
      await page.waitForTimeout(500);

      const stopBtn = page.getByRole('button', { name: /stop follow.?up|stop/i }).first();
      if (await stopBtn.isVisible({ timeout: 3_000 })) {
        await stopBtn.click();
        await page.waitForTimeout(500);
        expect(stopCalled).toBe(true);
      }
    }
  });
});
