/**
 * Test ad referral tracking by sending simulated webhook payloads.
 *
 * Usage:
 *   node src/scripts/testAdReferral.js [platform] [product]
 *
 * Examples:
 *   node src/scripts/testAdReferral.js whatsapp web
 *   node src/scripts/testAdReferral.js messenger chatbot
 *   node src/scripts/testAdReferral.js instagram seo
 *
 * Defaults: whatsapp web
 *
 * Make sure your server is running locally on PORT (default 3000).
 */

const axios = require('axios');
require('dotenv').config();

const BASE_URL = process.env.CHATBOT_BASE_URL || 'http://localhost:3000';
const platform = process.argv[2] || 'whatsapp';
const product = process.argv[3] || 'web';

const AD_BODIES = {
  web: 'Get a stunning custom website for your business — professional web design starting at $200!',
  chatbot: 'Automate your customer support with an AI chatbot — 24/7 instant responses!',
  seo: 'Rank #1 on Google — professional SEO services to boost your ranking!',
  smm: 'Grow your brand with social media marketing — content, ads, and strategy!',
  ecommerce: 'Launch your online store today — full ecommerce setup with payment integration!',
  app: 'Build your dream mobile app — Android & iOS development!',
  generic: 'Grow your business with Bytes Platform — digital solutions that work!',
};

const adBody = AD_BODIES[product] || AD_BODIES.generic;
const testPhone = '1234567890';
const testTimestamp = Math.floor(Date.now() / 1000).toString();

// WhatsApp webhook payload with referral
const whatsappPayload = {
  object: 'whatsapp_business_account',
  entry: [{
    id: 'TEST_WABA_ID',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '15551234567', phone_number_id: 'TEST_PHONE_ID' },
        contacts: [{ profile: { name: 'Test User' }, wa_id: testPhone }],
        messages: [{
          from: testPhone,
          id: `wamid.test_${Date.now()}`,
          timestamp: testTimestamp,
          type: 'text',
          text: { body: 'Hi, I saw your ad!' },
          referral: {
            source_id: 'AD_123456789',
            source_type: 'ad',
            source_url: 'https://fb.me/test-ad',
            headline: `Bytes Platform — ${product.toUpperCase()} Services`,
            body: adBody,
            ctwa_clid: `ctwa_test_${Date.now()}`,
          },
        }],
      },
    }],
  }],
};

// Messenger webhook payload with referral
const messengerPayload = {
  object: 'page',
  entry: [{
    id: 'TEST_PAGE_ID',
    time: Date.now(),
    messaging: [{
      sender: { id: `PSID_TEST_${Date.now()}` },
      recipient: { id: 'TEST_PAGE_ID' },
      timestamp: Date.now(),
      message: {
        mid: `mid.test_${Date.now()}`,
        text: 'Hi, I saw your ad!',
      },
      referral: {
        source: 'AD_123456789',
        type: 'OPEN_THREAD',
        ad_id: 'AD_123456789',
        ads_context_data: {
          title: `Bytes Platform — ${product.toUpperCase()} Services`,
          body: adBody,
          ad_title: `Bytes Platform — ${product.toUpperCase()}`,
          photo_url: 'https://example.com/ad-image.jpg',
        },
      },
    }],
  }],
};

// Instagram webhook payload with referral
const instagramPayload = {
  object: 'instagram',
  entry: [{
    id: 'TEST_IG_ID',
    time: Date.now(),
    messaging: [{
      sender: { id: `IGSID_TEST_${Date.now()}` },
      recipient: { id: 'TEST_IG_ID' },
      timestamp: Date.now(),
      message: {
        mid: `mid.test_${Date.now()}`,
        text: 'Hi, I saw your ad!',
      },
      referral: {
        source: 'AD_123456789',
        type: 'OPEN_THREAD',
        ad_id: 'AD_123456789',
        ads_context_data: {
          title: `Bytes Platform — ${product.toUpperCase()} Services`,
          body: adBody,
        },
      },
    }],
  }],
};

const payloads = {
  whatsapp: { url: `${BASE_URL}/webhook`, data: whatsappPayload },
  messenger: { url: `${BASE_URL}/msg-webhook`, data: messengerPayload },
  instagram: { url: `${BASE_URL}/msg-webhook`, data: instagramPayload },
};

async function test() {
  const { url, data } = payloads[platform];

  console.log(`\n--- Testing ${platform.toUpperCase()} Ad Referral ---`);
  console.log(`Product: ${product}`);
  console.log(`Ad body: "${adBody.slice(0, 60)}..."`);
  console.log(`Endpoint: ${url}`);
  console.log(`Sending...\n`);

  try {
    const res = await axios.post(url, data, {
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true, // don't throw on non-2xx
    });
    console.log(`Response: ${res.status} ${res.statusText}`);
    console.log(`\nCheck your server logs for:`);
    console.log(`  [AD TRACKING] Platform: ${platform} | Product: ${product} | ...`);
    console.log(`\nThe bot should respond with a ${product}-specific greeting.`);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    console.log('\nMake sure your server is running: npm start');
  }
}

test();
