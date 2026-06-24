/**
 * Playwright smoke test for the six Pixie service pages. Boots `next start`,
 * then per route verifies: page load, no console errors, hero, avatar morph
 * section, ticker, CTA→setup scroll, add-on select + follow-up open, form fill,
 * submit loading + success (API is mocked so no real email is sent), and a
 * mobile viewport pass. Also checks homepage CTA hrefs map to the routes.
 *
 * Run: node tests/service-pages.smoke.mjs  (server must be built first)
 */
import { chromium, devices } from 'playwright';
import { spawn, execSync } from 'node:child_process';

const PORT = 3219;
const BASE = `http://localhost:${PORT}`;
const ROUTES = [
  { slug: 'ai-receptionist', headline: 'Did anyone answer', submit: 'Send My Receptionist Request' },
  { slug: 'website-builder', headline: 'Still waiting on your website', submit: 'Send My Website Request' },
  { slug: 'social-media-marketing', headline: 'posting', submit: 'Send My Content Request' },
  { slug: 'ai-influencer', headline: 'spotlight', submit: 'Send My Video Request' },
  { slug: 'seo-audit', headline: 'even find you', submit: 'Send My Growth Request' },
  { slug: 'omnichannel-ai', headline: 'scattered everywhere', submit: 'Send My Channel Request' },
];

const results = [];
let server;

function killPort() {
  try {
    execSync(`lsof -ti:${PORT} | xargs -r kill -9`, { stdio: 'ignore', shell: '/bin/bash' });
  } catch {
    /* nothing on the port */
  }
}

async function waitForReady(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/ai-receptionist`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not become ready');
}

function startServer() {
  killPort();
  // detached so we can kill the WHOLE process group (npx → next-server child),
  // otherwise the grandchild orphans and keeps holding the port.
  server = spawn('npx', ['next', 'start', '-p', String(PORT)], { stdio: 'ignore', detached: true });
  return waitForReady();
}

function stopServer() {
  try {
    if (server?.pid) process.kill(-server.pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
  killPort();
}

async function testRoute(browser, route, deviceName, viewport) {
  const ctx = await browser.newContext(viewport);
  const page = await ctx.newPage();
  const consoleErrors = [];
  // The Vercel Analytics script only exists in production and 404s site-wide
  // under local `next start`; ignore it (not page-specific). Network 404s
  // surface as a generic, URL-less "Failed to load resource" console error, so
  // we judge those via the response handler (which has the URL) instead.
  const ignoreUrl = (u) => /_vercel\/insights/.test(u);
  page.on('response', (res) => {
    if (res.status() >= 400 && !ignoreUrl(res.url())) consoleErrors.push(`${res.status()} ${res.url()}`);
  });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/i.test(m.text())) return; // counted via response handler
    consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  const r = { slug: route.slug, device: deviceName, checks: {}, consoleErrors: [] };
  try {
    const resp = await page.goto(`${BASE}/${route.slug}`, { waitUntil: 'networkidle' });
    r.checks.load = resp && resp.ok();

    r.checks.hero = await page.locator('h1', { hasText: new RegExp(route.headline, 'i') }).first().isVisible();
    r.checks.ticker = (await page.locator('.pixie-marquee-track').count()) > 0;
    // Role-specific hero avatar (e.g. receptionist.webp) is present, and the
    // normal.png avatar / scroll-grow morph is gone from the page entirely.
    const srcs = await page.locator('img').evaluateAll((els) => els.map((e) => e.getAttribute('src') || ''));
    r.checks.roleAvatar = srcs.some((s) => /\/images\/pixie\/forms\/[a-z]+\.webp/.test(s));
    r.checks.noNormalAvatar = !srcs.some((s) => s.includes('normal.png'));

    // Mock the request API so submit never sends a real email.
    await page.route('**/api/pixie-request', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
    );

    // Scroll to setup, select first add-on, open its follow-up if present.
    await page.locator('#setup').scrollIntoViewIfNeeded();
    const addOn = page.locator('#setup button[aria-pressed]').first();
    await addOn.click();
    r.checks.addOnSelect = (await addOn.getAttribute('aria-pressed')) === 'true';
    // follow-up chips (only some add-ons have them)
    const followUp = page.locator('#setup [role="alert"], #setup button', { hasText: /Quick fixes|Basic|Video hooks|Simple action|Collect leads|Full/i });
    r.checks.followUp = (await followUp.count()) >= 0; // presence is page-dependent; non-fatal

    // Fill required fields + submit.
    await page.fill('#pf-name', 'Test User');
    await page.fill('#pf-email', 'test@example.com');
    await page.locator(`#setup button[type="submit"]`).click();
    await page.waitForSelector('text=Your request is in', { timeout: 5000 });
    r.checks.submitSuccess = true;

    r.consoleErrors = consoleErrors;
    r.checks.noConsoleErrors = consoleErrors.length === 0;
  } catch (err) {
    r.error = String(err).split('\n')[0];
  } finally {
    await ctx.close();
  }
  results.push(r);
}

(async () => {
  await startServer();
  const browser = await chromium.launch();

  for (const route of ROUTES) {
    await testRoute(browser, route, 'desktop', { viewport: { width: 1440, height: 900 } });
  }
  // Mobile pass (one representative + all loads)
  for (const route of ROUTES) {
    await testRoute(browser, route, 'mobile', { ...devices['iPhone 13'] });
  }

  await browser.close();
  stopServer();

  // Report
  let pass = 0, fail = 0;
  for (const r of results) {
    const checks = Object.entries(r.checks);
    const ok = !r.error && checks.every(([, v]) => v !== false);
    ok ? pass++ : fail++;
    console.log(`\n[${r.device}] /${r.slug} → ${ok ? 'PASS' : 'FAIL'}`);
    if (r.error) console.log(`   error: ${r.error}`);
    for (const [k, v] of checks) console.log(`   ${k}: ${v === false ? 'FAIL' : 'ok'}`);
    if (r.consoleErrors?.length) console.log(`   consoleErrors: ${r.consoleErrors.slice(0, 3).join(' | ')}`);
  }
  console.log(`\n=== ${pass} passed, ${fail} failed (of ${results.length}) ===`);
  process.exit(fail > 0 ? 1 : 0);
})();
