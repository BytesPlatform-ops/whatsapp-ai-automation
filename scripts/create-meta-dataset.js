#!/usr/bin/env node
/**
 * One-time script: creates a Meta Conversions API Dataset linked to your WABA.
 * Run once, copy the printed Dataset ID into META_DATASET_ID in .env.
 *
 * Usage:
 *   META_CAPI_ACCESS_TOKEN=<token> WHATSAPP_BUSINESS_ACCOUNT_ID=<waba_id> node scripts/create-meta-dataset.js
 *
 * Or set those vars in .env first and run:
 *   node -r dotenv/config scripts/create-meta-dataset.js
 */

const https = require('https');

const token  = process.env.META_CAPI_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

if (!token || !wabaId) {
  console.error('Missing META_CAPI_ACCESS_TOKEN (or WHATSAPP_ACCESS_TOKEN) and/or WHATSAPP_BUSINESS_ACCOUNT_ID');
  process.exit(1);
}

const body = JSON.stringify({
  name: 'Pixie Conversions Dataset',
  description: 'Server-side CAPI events from Pixie bot',
});

const options = {
  hostname: 'graph.facebook.com',
  path: `/v21.0/${wabaId}/offline_conversion_data_sets?access_token=${token}`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.id) {
        console.log('\n✅ Dataset created successfully!');
        console.log(`   Dataset ID: ${json.id}`);
        console.log('\nAdd to your .env:');
        console.log(`   META_DATASET_ID=${json.id}`);
        console.log(`   META_CAPI_ACCESS_TOKEN=<your_system_user_token>\n`);
      } else {
        console.error('❌ API error:', JSON.stringify(json, null, 2));
        process.exit(1);
      }
    } catch (e) {
      console.error('❌ Failed to parse response:', data);
      process.exit(1);
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Request failed:', e.message);
  process.exit(1);
});

req.write(body);
req.end();
