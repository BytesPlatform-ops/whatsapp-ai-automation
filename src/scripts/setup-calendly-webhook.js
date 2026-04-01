/**
 * One-time script to register a Calendly webhook subscription.
 *
 * Usage:
 *   node src/scripts/setup-calendly-webhook.js <YOUR_CALENDLY_TOKEN> <YOUR_WEBHOOK_URL>
 *
 * Example:
 *   node src/scripts/setup-calendly-webhook.js cal_abc123 https://your-ngrok-url.ngrok.io/calendly/webhook
 *
 * Steps:
 *   1. Go to https://calendly.com/integrations/api_webhooks and create a Personal Access Token
 *   2. Run this script with that token and your public server URL
 *   3. Save the signing key it outputs to your .env as CALENDLY_WEBHOOK_SIGNING_KEY
 */

const axios = require('axios');

const CALENDLY_API = 'https://api.calendly.com';

async function setup() {
  const token = process.argv[2];
  const webhookUrl = process.argv[3];

  if (!token || !webhookUrl) {
    console.log('Usage: node src/scripts/setup-calendly-webhook.js <CALENDLY_TOKEN> <WEBHOOK_URL>');
    console.log('');
    console.log('Example:');
    console.log('  node src/scripts/setup-calendly-webhook.js cal_abc123 https://your-domain.com/calendly/webhook');
    console.log('');
    console.log('Get your token at: https://calendly.com/integrations/api_webhooks');
    process.exit(1);
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Step 1: Get current user + organization URI
  console.log('1. Fetching your Calendly account info...');
  const meRes = await axios.get(`${CALENDLY_API}/users/me`, { headers });
  const orgUri = meRes.data.resource.current_organization;
  const userUri = meRes.data.resource.uri;
  const userName = meRes.data.resource.name;
  console.log(`   Account: ${userName}`);
  console.log(`   Organization: ${orgUri}`);

  // Step 2: Check for existing webhooks
  console.log('2. Checking existing webhook subscriptions...');
  const existingRes = await axios.get(`${CALENDLY_API}/webhook_subscriptions`, {
    headers,
    params: { organization: orgUri, scope: 'organization' },
  });

  const existing = existingRes.data.collection || [];
  const alreadyExists = existing.find((w) => w.callback_url === webhookUrl);

  if (alreadyExists) {
    console.log(`   Webhook already exists: ${alreadyExists.callback_url}`);
    console.log(`   Status: ${alreadyExists.state}`);
    console.log('   No changes needed.');
    process.exit(0);
  }

  console.log(`   Found ${existing.length} existing webhook(s), none match your URL.`);

  // Step 3: Create the webhook subscription
  console.log('3. Creating webhook subscription...');
  const createRes = await axios.post(
    `${CALENDLY_API}/webhook_subscriptions`,
    {
      url: webhookUrl,
      events: ['invitee.created', 'invitee.canceled'],
      organization: orgUri,
      scope: 'organization',
      signing_key: undefined, // Calendly generates this for us
    },
    { headers }
  );

  const webhook = createRes.data.resource;
  const signingKey = webhook.signing_key;

  console.log('');
  console.log('=== WEBHOOK CREATED SUCCESSFULLY ===');
  console.log('');
  console.log(`   URL: ${webhook.callback_url}`);
  console.log(`   Events: ${webhook.events.join(', ')}`);
  console.log(`   State: ${webhook.state}`);
  console.log('');

  if (signingKey) {
    console.log('=== IMPORTANT: SAVE THIS SIGNING KEY ===');
    console.log('');
    console.log(`   CALENDLY_WEBHOOK_SIGNING_KEY='${signingKey}'`);
    console.log('');
    console.log('   Add this to your .env file. This key is only shown ONCE.');
    console.log('');
  }

  console.log('Done! Your bot will now receive Calendly booking events.');
}

setup().catch((err) => {
  if (err.response) {
    console.error('Calendly API error:', err.response.status, JSON.stringify(err.response.data, null, 2));
  } else {
    console.error('Error:', err.message);
  }
  process.exit(1);
});
