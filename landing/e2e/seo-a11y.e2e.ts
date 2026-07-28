/**
 * E2E — Accessibility (axe-core/playwright)
 *
 * Runs axe on the key SEO pages and asserts no critical or serious violations.
 * Scope: WCAG 2.1 AA rules that axe can detect automatically. Manual testing
 * of colour contrast (some combinations are borderline) and keyboard-flow is
 * still needed.
 *
 * Requirements:
 *   npm i -D @axe-core/playwright   (already installed)
 *   npx playwright install chromium
 *
 * What axe checks (auto-detectable subset of WCAG):
 *   - Missing alt text on images
 *   - Form inputs without accessible labels
 *   - Buttons / links with no accessible name
 *   - Tables missing scope / th
 *   - ARIA violations (invalid roles, orphaned attributes)
 *   - Landmark / heading structure
 *   - Colour contrast (basic checks)
 *   - Focus-trap in modals (aria-modal must exist)
 */

import { test, expect, type Page } from 'playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { setupSeoPage } from './helpers/page-setup';

const BASE = '/pixie-lab/seo';

/** Run axe on the page and return critical/serious violations only. */
async function scanPage(page: Page) {
  // AxeBuilder from @axe-core/playwright uses playwright-core's Page type.
  // playwright/test's Page is compatible at runtime; cast to satisfy tsc.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder = new AxeBuilder({ page: page as any });
  const results = await builder
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  return results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );
}

const KEY_PAGES = [
  { name: 'Overview', path: `${BASE}` },
  { name: 'Sites', path: `${BASE}/sites` },
  { name: 'Crawl Jobs', path: `${BASE}/crawls` },
  { name: 'Issues', path: `${BASE}/issues` },
  { name: 'Pages', path: `${BASE}/pages` },
  { name: 'Keywords', path: `${BASE}/keywords` },
  { name: 'Rankings', path: `${BASE}/rankings` },
  { name: 'Backlinks', path: `${BASE}/backlinks` },
  { name: 'Outreach', path: `${BASE}/outreach` },
  { name: 'Local', path: `${BASE}/local` },
  { name: 'Locations', path: `${BASE}/locations` },
  { name: 'Citations', path: `${BASE}/citations` },
  { name: 'Billing Usage', path: `${BASE}/billing-usage` },
  { name: 'Connections', path: `${BASE}/connections` },
];

for (const { name, path } of KEY_PAGES) {
  test(`a11y: ${name} has no critical/serious violations`, async ({ page }) => {
    await setupSeoPage(page, { pagesTotal: 10, keywordsTotal: 10, backlinksTotal: 10, citationsTotal: 10, contactsTotal: 10 });
    await page.goto(path, { waitUntil: 'domcontentloaded' });

    // Wait for initial render to settle before scanning.
    await page.waitForTimeout(1500);

    const violations = await scanPage(page);

    if (violations.length > 0) {
      // Emit helpful output for debugging.
      const summary = violations.map((v) => {
        const nodes = v.nodes.slice(0, 3).map((n) => n.target.join(', ')).join(' | ');
        return `[${v.impact}] ${v.id}: ${v.description}\n  nodes: ${nodes}`;
      }).join('\n');
      console.error(`A11y violations on ${name}:\n${summary}`);
    }

    expect(violations).toHaveLength(0);
  });
}

test('a11y: Issues expanded drawer has no critical violations', async ({ page }) => {
  await setupSeoPage(page);
  await page.goto(`${BASE}/issues`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // Expand first issue.
  const expandBtn = page.getByRole('button', { name: /toggle issue detail/i }).first();
  if (await expandBtn.isVisible({ timeout: 5_000 })) {
    await expandBtn.click();
    await page.waitForTimeout(300);
  }

  const violations = await scanPage(page);
  const serious = violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  if (serious.length > 0) {
    console.error('A11y violations in expanded Issues drawer:', serious.map((v) => v.id));
  }
  expect(serious).toHaveLength(0);
});

test('a11y: Pages expanded drawer has no critical violations', async ({ page }) => {
  await setupSeoPage(page, { pagesTotal: 5 });
  await page.goto(`${BASE}/pages?crawl_job_id=crawl-test-001`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // Expand first page row.
  const row = page.locator('[aria-expanded="false"]').first();
  if (await row.isVisible({ timeout: 5_000 })) {
    await row.click();
    await page.waitForTimeout(300);
  }

  const violations = await scanPage(page);
  const serious = violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  if (serious.length > 0) {
    console.error('A11y violations in expanded Pages drawer:', serious.map((v) => v.id));
  }
  expect(serious).toHaveLength(0);
});

test('a11y: mobile viewport (375px) has no critical violations on Overview', async ({ page }) => {
  await setupSeoPage(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const violations = await scanPage(page);
  const serious = violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  if (serious.length > 0) {
    console.error('A11y violations on mobile Overview:', serious.map((v) => v.id));
  }
  expect(serious).toHaveLength(0);
});
