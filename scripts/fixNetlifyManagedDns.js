#!/usr/bin/env node
/**
 * Flip managed_dns=false on the 3 demo sites whose certs are stuck. When
 * a site's apex/alias has managed_dns=true but the actual nameservers are
 * elsewhere (here: GoDaddy), Netlify expects DNS-01 challenge but can't
 * write the validation TXT record — so cert provisioning hangs forever.
 * Switching to managed_dns=false makes Netlify use HTTP-01 instead.
 */
require('dotenv').config();
const axios = require('axios');
const { env } = require('../src/config/env');

const SITES = [
  { id: '970fcc66-664d-46cc-bbeb-d1d7f228af9a', label: 'austinclimate' },
  { id: '3ffa1e08-d126-49b4-b48b-d6dd7558d59e', label: 'sarahmitchell' },
  { id: '0ae7ed24-ff46-4739-aae5-8b6bc51279d0', label: 'bytecoffee' },
];

const headers = { Authorization: `Bearer ${env.netlify.token}`, 'Content-Type': 'application/json' };

(async () => {
  for (const s of SITES) {
    console.log(`\n=== ${s.label} ===`);
    try {
      // 1. flip managed_dns off
      const patch = await axios.patch(
        `https://api.netlify.com/api/v1/sites/${s.id}`,
        { managed_dns: false },
        { headers, timeout: 15000, validateStatus: () => true }
      );
      console.log(`PATCH managed_dns=false → status=${patch.status}`);

      // 2. trigger SSL provisioning
      const ssl = await axios.post(
        `https://api.netlify.com/api/v1/sites/${s.id}/ssl`,
        {},
        { headers, timeout: 30000, validateStatus: () => true }
      );
      console.log(`POST /ssl → status=${ssl.status} body=${JSON.stringify(ssl.data)}`);
    } catch (err) {
      console.log('error:', err.response?.status, err.response?.data || err.message);
    }
  }
})();
