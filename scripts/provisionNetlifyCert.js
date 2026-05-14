#!/usr/bin/env node
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
    console.log(`\n=== ${s.label} (${s.id}) ===`);
    // 1. Try the explicit provision endpoint with a body
    try {
      const r = await axios.post(
        `https://api.netlify.com/api/v1/sites/${s.id}/ssl`,
        {},
        { headers, timeout: 30000, validateStatus: () => true }
      );
      console.log(`POST /ssl → status=${r.status}`);
      console.log(`body:`, JSON.stringify(r.data, null, 2));
    } catch (err) {
      console.log(`POST /ssl error:`, err.response?.status || err.message);
    }

    // 2. Get the current cert state explicitly
    try {
      const r = await axios.get(
        `https://api.netlify.com/api/v1/sites/${s.id}/ssl`,
        { headers, timeout: 15000, validateStatus: () => true }
      );
      console.log(`GET /ssl → status=${r.status}`);
      console.log(`body:`, JSON.stringify(r.data, null, 2));
    } catch (err) {
      console.log(`GET /ssl error:`, err.response?.status || err.message);
    }
  }
})();
