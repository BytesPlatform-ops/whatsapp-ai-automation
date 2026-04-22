#!/usr/bin/env node
/**
 * One-shot end-to-end test site generator for the salon template.
 *
 * Produces a fresh salon site that:
 *   1. Ships with the "Activate Now" banner → Stripe payment link
 *   2. After payment (use test card 4242 4242 4242 4242), webhook
 *      fires → banner disappears automatically (redeployAsPaid)
 *   3. Native booking wired → filling the booking form redirects
 *      to the new /thank-you/ page and sends owner + customer emails
 *
 * All test artefacts are tagged with { _testTag: 'SALON_ACTIVATION_TEST_…' }
 * in site_data so they can be cleaned up later.
 *
 * Usage:
 *   node scripts/generateSalonActivationTest.js
 *   node scripts/generateSalonActivationTest.js --clean
 */

require('dotenv').config();

const { supabase } = require('../src/config/database');
const { generateWebsiteContent } = require('../src/website-gen/generator');
const { deployToNetlify } = require('../src/website-gen/deployer');
const { createPaymentLink } = require('../src/payments/stripe');
const salonDemo = require('./demos/salonDemo');

const TEST_TAG = 'SALON_ACTIVATION_TEST_2026_04_23';
const OWNER_EMAIL = 'nomansiddiqui872@gmail.com';
const TEST_PHONE = '+19990000099';
const WEBSITE_PRICE_USD = 199;

async function ensureTestUser() {
  // Upsert by phone so repeated runs don't pile up user rows.
  const { data: existing } = await supabase
    .from('users')
    .select('id, metadata')
    .eq('phone_number', TEST_PHONE)
    .maybeSingle();
  if (existing) {
    await supabase
      .from('users')
      .update({ metadata: { ...(existing.metadata || {}), email: OWNER_EMAIL, _testTag: TEST_TAG } })
      .eq('id', existing.id);
    return existing.id;
  }
  const { data, error } = await supabase
    .from('users')
    .insert({
      phone_number: TEST_PHONE,
      channel: 'whatsapp',
      state: 'ACTIVE',
      metadata: { email: OWNER_EMAIL, _testTag: TEST_TAG },
    })
    .select('id')
    .single();
  if (error) throw new Error(`user insert failed: ${error.message}`);
  return data.id;
}

async function insertSiteShell(userId) {
  // Insert first so we get the UUID — siteId needs to be baked into the
  // generated HTML (booking API URLs, form actions) before we deploy.
  const { data, error } = await supabase
    .from('generated_sites')
    .insert({
      user_id: userId,
      template_id: 'salon',
      status: 'generating',
      site_data: { _testTag: TEST_TAG },
    })
    .select('id')
    .single();
  if (error) throw new Error(`site shell insert failed: ${error.message}`);
  return data.id;
}

async function run() {
  console.log(`\n=== Salon activation + booking E2E test ===\n`);

  console.log('[1/6] Ensuring test user...');
  const userId = await ensureTestUser();
  console.log(`       user_id = ${userId}`);

  console.log('[2/6] Creating site shell row...');
  const siteId = await insertSiteShell(userId);
  console.log(`       site_id = ${siteId}`);

  console.log('[3/6] Creating Stripe payment link ($' + WEBSITE_PRICE_USD + ')...');
  const { url: paymentLinkUrl, paymentId, linkId } = await createPaymentLink({
    userId,
    phoneNumber: TEST_PHONE,
    amount: WEBSITE_PRICE_USD,
    serviceType: 'website',
    packageTier: 'test-activation',
    description: `Salon website activation — ${salonDemo.businessData.businessName}`,
    customerEmail: OWNER_EMAIL,
    customerName: 'Test Owner',
  });
  console.log(`       payment link: ${paymentLinkUrl}`);
  console.log(`       payment row:  ${paymentId}  |  link id: ${linkId}`);

  console.log('[4/6] Building salon site content...');
  const siteConfig = await generateWebsiteContent(salonDemo.businessData, { templateId: 'salon', siteId });

  // Activation banner wiring — these fields are read by renderActivationBanner
  // in website-gen/activationBanner.js. Without paymentLinkUrl the banner
  // falls back to a wa.me deep-link, which is not what we want to test here.
  siteConfig.siteId = siteId;
  siteConfig.paymentStatus = 'preview';
  siteConfig.paymentLinkUrl = paymentLinkUrl;

  // Make sure booking defaults are on the config for the template renderer
  siteConfig.bookingMode = 'native';
  siteConfig.timezone = salonDemo.businessData.timezone || 'America/New_York';
  siteConfig.weeklyHours = salonDemo.businessData.weeklyHours;
  siteConfig.salonServices = salonDemo.businessData.salonServices;
  siteConfig.contactEmail = OWNER_EMAIL; // emails fire to this address
  siteConfig.businessName = salonDemo.businessData.businessName;

  console.log('[5/6] Deploying to Netlify...');
  const { previewUrl, netlifySiteId, netlifySubdomain } = await deployToNetlify(siteConfig);
  console.log(`       preview: ${previewUrl}`);
  console.log(`       netlify site: ${netlifySiteId}  (${netlifySubdomain})`);

  console.log('[6/6] Saving site record to Supabase...');
  const { error: updErr } = await supabase
    .from('generated_sites')
    .update({
      preview_url: previewUrl,
      netlify_site_id: netlifySiteId,
      netlify_subdomain: netlifySubdomain,
      status: 'preview',
      booking_mode: 'native',
      booking_settings: {
        services: salonDemo.businessData.salonServices,
        weeklyHours: salonDemo.businessData.weeklyHours,
        timezone: salonDemo.businessData.timezone,
        slotMinutes: 30,
      },
      site_data: {
        ...siteConfig,
        contactEmail: OWNER_EMAIL,
        _testTag: TEST_TAG,
      },
    })
    .eq('id', siteId);
  if (updErr) throw new Error(`site update failed: ${updErr.message}`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' READY TO TEST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(` Preview URL:      ${previewUrl}`);
  console.log(` Payment link:     ${paymentLinkUrl}`);
  console.log(` Stripe test card: 4242 4242 4242 4242, any future date, any CVC`);
  console.log();
  console.log(' What to do:');
  console.log('   1. Open the preview URL — you\'ll see the Activate banner at top.');
  console.log('   2. Click "Activate now" → pay with the test card on Stripe.');
  console.log('   3. Wait ~15s, refresh the preview URL — banner should be gone.');
  console.log('   4. Go to /booking, pick a service + time, fill the form, submit.');
  console.log('   5. You should land on /thank-you/ with the booking summary.');
  console.log(`   6. Owner + customer emails should arrive at ${OWNER_EMAIL}`);
  console.log();
  console.log(` Site ID (for cleanup): ${siteId}`);
  console.log(` Run with --clean to revert to preview + delete test rows.`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

async function clean() {
  console.log('\n=== Cleanup ===\n');
  const { data: sites } = await supabase
    .from('generated_sites')
    .select('id, site_data')
    .limit(200);
  const testSites = (sites || []).filter((s) => s.site_data?._testTag === TEST_TAG);
  console.log(`found ${testSites.length} test sites`);
  for (const s of testSites) {
    // Appointments FK → delete first
    const { error: apErr, count: apCount } = await supabase
      .from('appointments')
      .delete({ count: 'exact' })
      .eq('site_id', s.id);
    if (apErr) console.warn(`  [${s.id}] appt delete warn: ${apErr.message}`);
    else console.log(`  [${s.id}] deleted ${apCount || 0} appointments`);
    // Form submissions FK → delete too
    await supabase.from('form_submissions').delete().eq('site_id', s.id);
    // Then the site row
    await supabase.from('generated_sites').delete().eq('id', s.id);
    console.log(`  [${s.id}] site deleted`);
  }
  // Test users
  const { data: users } = await supabase
    .from('users')
    .select('id, metadata')
    .eq('phone_number', TEST_PHONE);
  for (const u of users || []) {
    // payments FK
    await supabase.from('payments').delete().eq('user_id', u.id);
    await supabase.from('users').delete().eq('id', u.id);
    console.log(`  [user ${u.id}] deleted (plus payments)`);
  }
  console.log('\ndone.\n');
}

(async () => {
  try {
    if (process.argv.includes('--clean')) await clean();
    else await run();
  } catch (err) {
    console.error('\nFATAL:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
