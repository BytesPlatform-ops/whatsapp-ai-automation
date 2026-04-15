/**
 * Utility: list existing Calendly webhook subscriptions, optionally delete
 * one by URL so you can re-register it and capture the signing key.
 *
 * Usage:
 *   # List all webhooks:
 *   node src/scripts/delete-calendly-webhook.js <CALENDLY_PAT>
 *
 *   # Delete the one matching a URL:
 *   node src/scripts/delete-calendly-webhook.js <CALENDLY_PAT> <WEBHOOK_URL>
 *
 * Or stash CALENDLY_PAT in .env and run with at most the URL.
 */

require('dotenv').config();
const axios = require('axios');

const CALENDLY_API = 'https://api.calendly.com';

async function run() {
  const token = process.argv[2] || process.env.CALENDLY_PAT;
  const targetUrl = process.argv[3] || process.env.CALENDLY_WEBHOOK_URL;

  if (!token) {
    console.log('Usage: node src/scripts/delete-calendly-webhook.js <CALENDLY_PAT> [WEBHOOK_URL]');
    console.log('Or set CALENDLY_PAT in .env and run with no args to list existing webhooks.');
    process.exit(1);
  }

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Resolve organization URI first — webhooks are scoped to orgs.
  const meRes = await axios.get(`${CALENDLY_API}/users/me`, { headers });
  const orgUri = meRes.data.resource.current_organization;

  const listRes = await axios.get(`${CALENDLY_API}/webhook_subscriptions`, {
    headers,
    params: { organization: orgUri, scope: 'organization' },
  });
  const hooks = listRes.data.collection || [];

  if (hooks.length === 0) {
    console.log('No webhook subscriptions found for this organization.');
    return;
  }

  console.log(`Found ${hooks.length} webhook subscription(s):`);
  for (const h of hooks) {
    console.log(`  - ${h.callback_url}  [state: ${h.state}]  id: ${h.uri}`);
  }

  if (!targetUrl) {
    console.log('');
    console.log('Pass a URL as the second argument to delete one.');
    return;
  }

  const match = hooks.find((h) => h.callback_url === targetUrl);
  if (!match) {
    console.log(`No webhook matches URL: ${targetUrl}`);
    process.exit(1);
  }

  console.log(`\nDeleting: ${match.callback_url}`);
  await axios.delete(match.uri, { headers });
  console.log('Deleted. Now re-run setup-calendly-webhook.js to register a fresh one — the signing key will be printed this time.');
}

run().catch((err) => {
  if (err.response) {
    console.error('Calendly API error:', err.response.status, JSON.stringify(err.response.data, null, 2));
  } else {
    console.error('Error:', err.message);
  }
  process.exit(1);
});
