#!/usr/bin/env node
require('dotenv').config();
const axios = require('axios');
const { env } = require('../src/config/env');

(async () => {
  const siteId = process.argv[2] || 'd47b8bcf-4695-430d-9035-83e9a0891300';
  const headers = { Authorization: `Bearer ${env.netlify.token}` };
  const r = await axios.get(`https://api.netlify.com/api/v1/sites/${siteId}`, { headers });
  const s = r.data;
  console.log('name:', s.name);
  console.log('url:', s.url);
  console.log('ssl_url:', s.ssl_url);
  console.log('custom_domain:', s.custom_domain);
  console.log('domain_aliases:', s.domain_aliases);
  console.log('ssl:', s.ssl);
  console.log('force_ssl:', s.force_ssl);
  console.log('managed_dns:', s.managed_dns);
  console.log('state:', s.state);
})().catch((e) => { console.error(e.response?.data || e.message); process.exit(1); });
