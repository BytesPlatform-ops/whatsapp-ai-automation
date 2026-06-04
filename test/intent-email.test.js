'use strict';

// Standalone regression test for the intent email ladder (no test runner).
//   node -r dotenv/config test/intent-email.test.js
//
// Stubs supabase / sendEmail / updateUserMetadata via require.cache so nothing
// hits the network or DB. Asserts the gating rules and step selection.

const path = require('path');

// ── stubs ───────────────────────────────────────────────────────────────────
let lastInbound = null;          // { created_at } | null
let sent = [];                   // sendEmail calls
let updates = [];                // updateUserMetadata calls

const chain = new Proxy({}, {
  get(_t, prop) {
    if (prop === 'maybeSingle' || prop === 'single') return async () => ({ data: lastInbound });
    return () => chain; // from/select/eq/order/limit all chain
  },
});
function stub(rel, exports) {
  const abs = require.resolve(path.join(__dirname, '..', rel));
  require.cache[abs] = { id: abs, filename: abs, loaded: true, exports };
}
stub('src/config/database', { supabase: { from: () => chain } });
stub('src/notifications/email', { sendEmail: async (a) => { sent.push(a); return true; } });
stub('src/db/users', { updateUserMetadata: async (id, patch) => { updates.push({ id, patch }); } });

// resolve wa.me from env so no Graph call
process.env.WA_DISPLAY_NUMBERS = 'PN_INTL:14695360430';

const { processIntentEmailFollowup } = require('../src/followup/scheduler');

// ── helpers ─────────────────────────────────────────────────────────────────
const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();
function baseUser(meta = {}) {
  return {
    id: 'u1', phone_number: '+15550000000', via_phone_number_id: 'PN_INTL',
    metadata: { email: 'lead@example.com', adReferral: { ctwaClid: 'x' }, adIndustry: 'realestate', ...meta },
  };
}
let passed = 0, failed = 0;
async function run(name, { user, quietHours }, expect) {
  sent = []; updates = []; lastInbound = quietHours == null ? null : { created_at: hoursAgo(quietHours) };
  await processIntentEmailFollowup(user);
  const sentStep = sent.length ? (updates[0]?.patch?.intentEmailSteps?.slice(-1)[0] || 'SENT') : null;
  const ok = expect.step === undefined ? sent.length === 0 : (sent.length === 1 && sentStep === expect.step);
  console.log(`${ok ? '✅' : '❌'} ${name}  (sent=${sent.length}${sentStep ? ' step=' + sentStep : ''}${expect.step ? ', expected=' + expect.step : ', expected=NONE'})`);
  ok ? passed++ : failed++;
}

(async () => {
  // step selection
  await run('quiet 2h → intent_1h',       { user: baseUser(), quietHours: 2 },   { step: 'intent_1h' });
  await run('quiet 30h → intent_24h',     { user: baseUser(), quietHours: 30 },  { step: 'intent_24h' });
  await run('quiet 100h → intent_3d',     { user: baseUser(), quietHours: 100 }, { step: 'intent_3d' });
  await run('quiet 200h → intent_7d',     { user: baseUser(), quietHours: 200 }, { step: 'intent_7d' });
  await run('quiet 0.5h → nothing due',   { user: baseUser(), quietHours: 0.5 }, { });

  // resume mid-ladder: already sent 1h, now 30h → next is 24h
  await run('1h done, quiet 30h → 24h',   { user: baseUser({ intentEmailSteps: ['intent_1h'] }), quietHours: 30 }, { step: 'intent_24h' });
  await run('all done, quiet 300h → none',{ user: baseUser({ intentEmailSteps: ['intent_1h','intent_24h','intent_3d','intent_7d'] }), quietHours: 300 }, { });

  // gating
  await run('no email → skip',            { user: baseUser({ email: null, websiteData: {} }), quietHours: 50 }, { });
  await run('paymentLinkSentAt → skip',   { user: baseUser({ paymentLinkSentAt: hoursAgo(50) }), quietHours: 50 }, { });
  await run('no stated intent → skip',    { user: { id:'u', phone_number:'+1', via_phone_number_id:'PN_INTL', metadata: { email:'a@b.com' } }, quietHours: 50 }, { });
  await run('opted out → skip',           { user: baseUser({ followupOptOut: true }), quietHours: 50 }, { });
  await run('paid → skip',                { user: baseUser({ paymentConfirmed: true }), quietHours: 50 }, { });
  await run('human takeover → skip',      { user: baseUser({ humanTakeover: true }), quietHours: 50 }, { });
  await run('no inbound on file → skip',  { user: baseUser(), quietHours: null }, { });

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  process.exit(failed ? 1 : 0);
})();
