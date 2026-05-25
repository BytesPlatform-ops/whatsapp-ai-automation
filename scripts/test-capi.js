#!/usr/bin/env node
/**
 * CAPI test harness — fires sample Lead / LeadSubmitted / Purchase events
 * at the configured Meta dataset and prints Meta's response so you can
 * confirm the integration end-to-end.
 *
 * Recommended flow (no prod-data pollution):
 *   1. In Events Manager → your dataset → Test Events, copy the test code
 *      (looks like "TEST12345").
 *   2. Put it in .env:  META_CAPI_TEST_EVENT_CODE=TEST12345
 *   3. Run this script, then watch the events appear live in that tab.
 *
 * Usage:
 *   node -r dotenv/config scripts/test-capi.js                # all 3 sample events
 *   node -r dotenv/config scripts/test-capi.js lead           # just organic Lead
 *   node -r dotenv/config scripts/test-capi.js leadsubmitted  # CTWA LeadSubmitted
 *   node -r dotenv/config scripts/test-capi.js purchase       # just Purchase
 *
 * Env required: META_DATASET_ID, META_CAPI_ACCESS_TOKEN
 * Env optional: META_CAPI_TEST_EVENT_CODE (strongly recommended for testing)
 */

const { trackWebsitePreview, trackPurchase } = require('../src/integrations/metaCapi');

const datasetId = process.env.META_DATASET_ID;
const token     = process.env.META_CAPI_ACCESS_TOKEN;
const testCode  = process.env.META_CAPI_TEST_EVENT_CODE;

if (!datasetId || !token) {
  console.error('\n❌ CAPI is not configured — sendCapiEvents() will no-op.');
  console.error('   Set these in .env first:');
  console.error('     META_DATASET_ID=<from scripts/create-meta-dataset.js>');
  console.error('     META_CAPI_ACCESS_TOKEN=<system-user token>');
  console.error('     META_CAPI_TEST_EVENT_CODE=<from Events Manager → Test Events>  (recommended)\n');
  process.exit(1);
}

// Sample identity — hashed inside metaCapi before sending. Use a fake
// number/email so test data never collides with a real lead.
const SAMPLE = {
  phone: '+15555550123',
  email: 'capi-test@example.com',
};

async function fireLead() {
  console.log('→ Firing organic Lead (no ctwaClid)…');
  return trackWebsitePreview({
    phone: SAMPLE.phone,
    email: SAMPLE.email,
    previewUrl: 'https://capitest.pixiebot.co',
    ctwaClid: null,
    channel: 'whatsapp',
  });
}

async function fireLeadSubmitted() {
  console.log('→ Firing CTWA LeadSubmitted (with fake ctwaClid)…');
  return trackWebsitePreview({
    phone: SAMPLE.phone,
    email: SAMPLE.email,
    previewUrl: 'https://capitest.pixiebot.co',
    ctwaClid: `ctwa_test_${Date.now()}`,
    channel: 'whatsapp',
  });
}

async function firePurchase() {
  console.log('→ Firing Purchase…');
  return trackPurchase({
    phone: SAMPLE.phone,
    email: SAMPLE.email,
    value: 149,
    currency: 'usd',
    contentName: 'Website Package (test)',
    orderId: `test_order_${Date.now()}`,
    ctwaClid: null,
    channel: 'whatsapp',
  });
}

async function main() {
  const which = (process.argv[2] || 'all').toLowerCase();

  console.log(`\nDataset: ${datasetId}`);
  console.log(testCode
    ? `Test mode: ON (code ${testCode}) — events route to Events Manager → Test Events\n`
    : `⚠️  Test mode: OFF — events will count as PRODUCTION data. Set META_CAPI_TEST_EVENT_CODE to isolate.\n`);

  const tasks = [];
  if (which === 'all' || which === 'lead') tasks.push(fireLead);
  if (which === 'all' || which === 'leadsubmitted') tasks.push(fireLeadSubmitted);
  if (which === 'all' || which === 'purchase') tasks.push(firePurchase);

  if (tasks.length === 0) {
    console.error(`Unknown event "${which}". Use: lead | leadsubmitted | purchase | all`);
    process.exit(1);
  }

  for (const task of tasks) {
    const res = await task();
    if (res) {
      console.log(`   ✅ Meta response: ${JSON.stringify(res)}`);
    } else {
      console.log('   ⚠️  No response returned (check the [CAPI] warning logged above).');
    }
  }

  console.log(testCode
    ? '\nDone. Open Events Manager → your dataset → Test Events to see them live.\n'
    : '\nDone. Open Events Manager → your dataset → Overview (may take a few minutes to show).\n');
}

main().catch((err) => {
  console.error('❌ test-capi failed:', err.message);
  process.exit(1);
});
