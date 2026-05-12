#!/usr/bin/env node
/**
 * One-off: attach branded pixiebot.co subdomains to the 4 demo sites
 * currently linked from landing/lib/demoSites.ts. After running this,
 * the user needs to add the corresponding CNAME records in their DNS
 * panel; Netlify will then issue free Let's Encrypt certs.
 *
 * Run from repo root:
 *   node scripts/attachDemoSubdomains.js
 */
require('dotenv').config();
const axios = require('axios');
const { env } = require('../src/config/env');
const { addCustomDomainToNetlify } = require('../src/website-gen/deployer');

const NETLIFY_API = 'https://api.netlify.com/api/v1';
const APEX = 'pixiebot.co';

// Maps the CURRENT preview-* subdomains (per landing/lib/demoSites.ts) to
// the desired branded subdomain. The script looks up each site by its
// Netlify subdomain, then attaches the alias.
const MAPPING = [
  { id: 'hvac',        currentSubdomain: 'preview-1776447034475', branded: 'austinclimate' },
  { id: 'real-estate', currentSubdomain: 'preview-1776447076417', branded: 'sarahmitchell' },
  { id: 'salon',       currentSubdomain: 'preview-1778539528740', branded: 'blushbar' },
  { id: 'generic',     currentSubdomain: 'preview-1776447150399', branded: 'bytecoffee' },
];

async function findSiteByName(name) {
  const headers = { Authorization: `Bearer ${env.netlify.token}` };
  // Netlify supports `?name=foo` which returns sites with that primary
  // subdomain. Returns an array; we take the first exact match.
  const r = await axios.get(`${NETLIFY_API}/sites`, {
    headers,
    params: { name, filter: 'all' },
    timeout: 15000,
  });
  const sites = Array.isArray(r.data) ? r.data : [];
  return sites.find((s) => s.name === name) || null;
}

(async () => {
  if (!env.netlify.token) {
    console.error('NETLIFY_TOKEN not set in env.');
    process.exit(1);
  }
  console.log('Attaching branded subdomains to demo sites…\n');

  const results = [];
  for (const m of MAPPING) {
    const fqdn = `${m.branded}.${APEX}`;
    process.stdout.write(`  • ${m.id.padEnd(12)} → ${fqdn} … `);
    try {
      const site = await findSiteByName(m.currentSubdomain);
      if (!site) {
        console.log(`SKIP (site "${m.currentSubdomain}" not found on Netlify)`);
        results.push({ ...m, fqdn, ok: false, reason: 'not found' });
        continue;
      }
      await addCustomDomainToNetlify(site.id, fqdn);
      console.log(`OK   (site ${site.id})`);
      results.push({ ...m, fqdn, ok: true, siteId: site.id });
    } catch (err) {
      console.log(`FAIL (${err.response?.status || ''} ${err.message})`);
      results.push({ ...m, fqdn, ok: false, reason: err.message });
    }
  }

  console.log('\n━━━ DNS records to add ━━━');
  console.log('Add each as a CNAME on pixiebot.co. Type: CNAME, TTL: 3600 (or auto).\n');
  for (const r of results.filter((x) => x.ok)) {
    console.log(`  ${r.branded.padEnd(16)} CNAME  ${r.currentSubdomain}.netlify.app`);
  }
  console.log('\nNetlify will issue free Let\'s Encrypt certs automatically once DNS resolves (~5–30 min).');
})().catch((err) => {
  console.error('Fatal:', err.response?.data || err.message);
  process.exit(1);
});
