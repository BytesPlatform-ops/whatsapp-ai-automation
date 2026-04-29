// One-shot end-to-end test for contact-form lead capture across all 4
// templates (HVAC, Real Estate, Salon, Generic). Inserts 4 throwaway
// rows into generated_sites, POSTs a form submission matching each
// template's field conventions to the production endpoint, waits a
// few seconds for the fire-and-forget SendGrid dispatch to complete,
// then reads delivery_status back from form_submissions.
//
// Usage:
//   node scripts/testContactForms.js          # run tests + leave rows
//   node scripts/testContactForms.js --clean  # delete test rows + leads

const { supabase } = require('../src/config/database');

const API_BASE = 'https://whatsapp-ai-automation-h3y0.onrender.com';
const OWNER_EMAIL = 'nomansiddiqui872@gmail.com';

// Form payloads matching each template's exact input `name` attributes.
// These mirror what a browser would serialize when the user submits
// the generated contact form — verifying the endpoint accepts each
// shape correctly.
const TEMPLATES = [
  {
    id: 'hvac',
    businessName: 'TEST — Northstar HVAC',
    payload: {
      name: 'Jane Customer (HVAC test)',
      phone: '+1 (555) 234-0101',
      email: 'jane.hvac@test.pixiebot.co',
      service: 'Furnace Repair',
      address: '500 Elm St, Chicago IL',
      details: 'Furnace making a knocking sound when it kicks on. Need same-day service if possible. (HVAC TEMPLATE TEST)',
      date: '2026-04-25',
      urgency: 'Same-day needed',
      form_name: 'quote',
      source_page: '/contact',
      _honey: '',
    },
  },
  {
    id: 'real-estate',
    businessName: 'TEST — Coastline Realty',
    payload: {
      name: 'Mark Homeseeker (Real Estate test)',
      email: 'mark.re@test.pixiebot.co',
      phone: '+1 (555) 234-0202',
      message: 'Looking to buy a 3BR in the coastal area — budget around $650k. Available for a call this week. (REAL-ESTATE TEMPLATE TEST)',
      form_name: 'consultation',
      source_page: '/contact',
      _honey: '',
    },
  },
  {
    id: 'salon',
    businessName: 'TEST — Luna Beauty Studio',
    payload: {
      'first-name': 'Aria',
      'last-name': 'Garcia (Salon test)',
      email: 'aria.salon@test.pixiebot.co',
      phone: '+1 (555) 234-0303',
      message: 'Hi! Do you offer group bookings for a bridal party of 6? Looking for early-June availability. (SALON TEMPLATE TEST)',
      form_name: 'contact',
      source_page: '/contact',
      _honey: '',
    },
  },
  {
    id: 'generic',
    businessName: 'TEST — Atlas Consulting',
    payload: {
      'first-name': 'Liam',
      'last-name': 'Brooks (Generic test)',
      email: 'liam.generic@test.pixiebot.co',
      message: 'Interested in a discovery call about your retainer packages. I run a small SaaS and need ongoing help. (GENERIC TEMPLATE TEST)',
      form_name: 'contact',
      source_page: '/contact',
      _honey: '',
    },
  },
];

const TEST_TAG = 'CONTACT_FORM_TEST_2026_04_22';

async function insertTestSites() {
  const siteIdByTemplate = {};
  for (const t of TEMPLATES) {
    const { data, error } = await supabase
      .from('generated_sites')
      .insert({
        user_id: null,
        preview_url: `https://example.test/${t.id}`,
        site_data: {
          businessName: t.businessName,
          contactEmail: OWNER_EMAIL,
          templateId: t.id,
          _testTag: TEST_TAG,
        },
      })
      .select('id')
      .single();
    if (error) {
      console.error(`[${t.id}] insert failed:`, error.message);
      throw error;
    }
    siteIdByTemplate[t.id] = data.id;
    console.log(`[${t.id}] test site inserted: ${data.id}`);
  }
  return siteIdByTemplate;
}

async function submitLead(siteId, payload) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(payload)) body.append(k, String(v));
  const res = await fetch(`${API_BASE}/public/leads/${siteId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: body.toString(),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function checkDeliveryStatus(leadId) {
  const { data } = await supabase
    .from('form_submissions')
    .select('delivery_status, delivery_error')
    .eq('id', leadId)
    .maybeSingle();
  return data || { delivery_status: 'unknown', delivery_error: null };
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function runTests() {
  console.log(`\n=== Contact-form E2E test — mail to ${OWNER_EMAIL} ===\n`);
  const siteIds = await insertTestSites();

  console.log('\n--- Submitting leads ---');
  const results = [];
  for (const t of TEMPLATES) {
    const siteId = siteIds[t.id];
    const r = await submitLead(siteId, t.payload);
    console.log(`[${t.id}] POST → status=${r.status} ok=${r.json?.ok} leadId=${r.json?.leadId || '-'}`);
    results.push({ template: t.id, siteId, leadId: r.json?.leadId, status: r.status, ok: r.json?.ok });
  }

  console.log('\n--- Waiting 8s for SendGrid dispatch ---');
  await sleep(8000);

  console.log('\n--- Delivery status from form_submissions ---');
  for (const r of results) {
    if (!r.leadId) { console.log(`[${r.template}] skipped — no leadId`); continue; }
    const d = await checkDeliveryStatus(r.leadId);
    const icon = d.delivery_status === 'sent' ? 'OK  ' : 'FAIL';
    console.log(`${icon} [${r.template}] delivery_status=${d.delivery_status}${d.delivery_error ? ` error="${d.delivery_error}"` : ''}`);
  }

  console.log('\nTest site IDs (for later cleanup):');
  for (const t of TEMPLATES) console.log(`  ${t.id}: ${siteIds[t.id]}`);
  console.log(`\nRe-run with --clean to delete these rows + their leads.`);
}

async function cleanupTestRows() {
  console.log(`\n=== Cleanup: removing rows tagged ${TEST_TAG} ===\n`);
  // Find test site IDs
  const { data: sites } = await supabase
    .from('generated_sites')
    .select('id, site_data')
    .limit(100);
  const testSites = (sites || []).filter((s) => s.site_data?._testTag === TEST_TAG);
  if (!testSites.length) { console.log('no test sites found'); return; }
  const ids = testSites.map((s) => s.id);
  console.log(`found ${ids.length} test sites:`, ids);

  // Delete form_submissions first (FK dependency)
  const { error: leadErr, count: leadCount } = await supabase
    .from('form_submissions')
    .delete({ count: 'exact' })
    .in('site_id', ids);
  if (leadErr) console.error('lead delete failed:', leadErr.message);
  else console.log(`deleted ${leadCount || 0} form_submissions`);

  // Delete sites
  const { error: siteErr, count: siteCount } = await supabase
    .from('generated_sites')
    .delete({ count: 'exact' })
    .in('id', ids);
  if (siteErr) console.error('site delete failed:', siteErr.message);
  else console.log(`deleted ${siteCount || 0} generated_sites`);
}

(async () => {
  try {
    if (process.argv.includes('--clean')) await cleanupTestRows();
    else await runTests();
  } catch (err) {
    console.error('\nFATAL:', err.message);
    process.exit(1);
  }
})();
