#!/usr/bin/env node
/**
 * Seed a fake CTWA referral onto tester users so the next message they
 * send Pixie triggers the website-builder Flow — no live ad needed.
 *
 * For each phone: find/create the user row on Pixie's number, set a test
 * ctwa_clid + adSource, reset to a fresh SALES_CHAT state, and clear any
 * prior flowSentAt so the Flow can (re)send.
 *
 * Usage: node -r dotenv/config scripts/flows/seed-test-ctwa.js [phone ...]
 *        (defaults to TESTER_PHONES from env)
 */

const { findOrCreateUser, updateUserMetadata, updateUserState } = require('../../src/db/users');

const PIXIE_PNID = process.env.WHATSAPP_PHONE_NUMBER_ID || '1036767402856038';

async function seed(phone) {
  const user = await findOrCreateUser(phone, 'whatsapp', PIXIE_PNID);
  const clid = 'ctwa_seedtest_' + phone.slice(-4);
  await updateUserState(user.id, 'SALES_CHAT');
  await updateUserMetadata(user.id, {
    adSource: 'web',
    adIndustry: null,
    adReferral: {
      sourceId: 'seed-test',
      sourceType: 'ad',
      headline: 'Free website in 60s',
      body: 'website builder',
      ctwaClid: clid,
      platform: 'whatsapp',
      timestamp: new Date().toISOString(),
    },
    // Clear so the Flow can (re)send on the next inbound.
    flowSentAt: null,
    flowToken: null,
    // Fresh slate so it behaves like a first-touch ad arrival.
    websiteData: null,
    websiteDemoTriggered: false,
    currentSiteId: null,
  });
  console.log(`  ✅ ${phone} seeded (clid=${clid}, state=SALES_CHAT, flowSent cleared)`);
}

(async () => {
  const phones = process.argv.slice(2).filter(Boolean);
  const list = phones.length ? phones : String(process.env.TESTER_PHONES || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.length) { console.error('No phones given and TESTER_PHONES is empty.'); process.exit(1); }
  console.log(`Seeding CTWA test on Pixie number ${PIXIE_PNID}:`);
  for (const p of list) {
    try { await seed(p); } catch (e) { console.log(`  ❌ ${p}: ${e.message}`); }
  }
  console.log('\nDone. Message Pixie from any seeded number → you should get the "Get Started" Flow.\n(Each number sends once; re-run this to reset and test again.)');
  process.exit(0);
})();
