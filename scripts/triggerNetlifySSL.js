#!/usr/bin/env node
/**
 * Force Netlify to (re-)provision the Let's Encrypt cert for a given
 * site. Useful right after a custom subdomain CNAME goes live — DNS
 * resolves before Netlify's auto-prober notices, so this nudges it.
 *
 * Usage: node scripts/triggerNetlifySSL.js [siteId]
 *   defaults to the blushbar.pixiebot.co salon demo site.
 */
require('dotenv').config();
const axios = require('axios');
const { env } = require('../src/config/env');

const NETLIFY_API = 'https://api.netlify.com/api/v1';
const DEFAULT_SITE_ID = 'd47b8bcf-4695-430d-9035-83e9a0891300'; // salon

(async () => {
  const siteId = process.argv[2] || DEFAULT_SITE_ID;
  if (!env.netlify.token) {
    console.error('NETLIFY_TOKEN not set in env.');
    process.exit(1);
  }
  const headers = { Authorization: `Bearer ${env.netlify.token}` };

  console.log(`Checking SSL state for site ${siteId}…`);
  try {
    const before = await axios.get(`${NETLIFY_API}/sites/${siteId}/ssl`, { headers, timeout: 15000 });
    console.log('Current SSL:', JSON.stringify(before.data, null, 2));
  } catch (err) {
    console.log('SSL GET:', err.response?.status, err.response?.data?.message || err.message);
  }

  console.log('\nTriggering provisioning…');
  try {
    const r = await axios.post(`${NETLIFY_API}/sites/${siteId}/ssl`, {}, { headers, timeout: 30000 });
    console.log('Result:', JSON.stringify(r.data, null, 2));
  } catch (err) {
    console.log('SSL POST:', err.response?.status, err.response?.data?.message || err.message);
  }
})();
