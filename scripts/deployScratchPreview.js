#!/usr/bin/env node
/**
 * One-off: deploy a STATIC directory (hand-built preview, not generator
 * output) to a fresh Netlify site and attach a pixiebot.co subdomain.
 *
 *   node scripts/deployScratchPreview.js <dir> <subdomain> [siteName]
 *   node scripts/deployScratchPreview.js scratch/dev-portfolio-preview alexrivera.pixiebot.co alexrivera-portfolio
 *
 * Requires NETLIFY_TOKEN. Reuses the deployer's domain-attach helper and the
 * same SHA-1 digest upload protocol deployToNetlify uses. The subdomain still
 * needs a DNS CNAME (<sub> -> <site>.netlify.app) in whatever manages
 * pixiebot.co DNS — this script prints the exact record at the end.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const { env } = require('../src/config/env');
const { addCustomDomainToNetlify } = require('../src/website-gen/deployer');

const API = 'https://api.netlify.com/api/v1';
const TIMEOUT = 60000;

const [, , dirArg, subdomainArg, siteNameArg] = process.argv;
if (!dirArg || !subdomainArg) {
  console.error('Usage: node scripts/deployScratchPreview.js <dir> <subdomain> [siteName]');
  process.exit(1);
}
const rootDir = path.resolve(process.cwd(), dirArg);
const subdomain = subdomainArg.toLowerCase();

function walk(dir, base = '') {
  const out = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue; // skip .DS_Store etc.
    const abs = path.join(dir, entry.name);
    const rel = `${base}/${entry.name}`;
    if (entry.isDirectory()) Object.assign(out, walk(abs, rel));
    else out[rel] = fs.readFileSync(abs);
  }
  return out;
}

async function main() {
  if (!env.netlify.token) throw new Error('NETLIFY_TOKEN is not configured');
  const headers = { Authorization: `Bearer ${env.netlify.token}`, 'Content-Type': 'application/json' };

  const buffers = walk(rootDir); // { '/index.html': <Buffer>, '/about/index.html': ... }
  const paths = Object.keys(buffers);
  if (!paths.length) throw new Error(`No files found under ${rootDir}`);
  const digests = {};
  for (const p of paths) digests[p] = crypto.createHash('sha1').update(buffers[p]).digest('hex');
  console.log(`Deploying ${paths.length} file(s) from ${rootDir}:`);
  paths.forEach((p) => console.log('  ', p));

  // 1. Create site (clean name if free, else timestamped fallback).
  let siteId, siteName;
  const wanted = siteNameArg || `preview-${Date.now()}`;
  try {
    const r = await axios.post(`${API}/sites`, { name: wanted }, { headers, timeout: TIMEOUT });
    siteId = r.data.id; siteName = r.data.name;
  } catch (e) {
    if (e.response && [422, 409, 400].includes(e.response.status)) {
      const fallback = `preview-${Date.now()}`;
      console.warn(`Name "${wanted}" unavailable (${e.response.status}); using ${fallback}`);
      const r = await axios.post(`${API}/sites`, { name: fallback }, { headers, timeout: TIMEOUT });
      siteId = r.data.id; siteName = r.data.name;
    } else throw e;
  }
  console.log(`Site created: ${siteName} (${siteId})`);

  // 2. Create deploy with the digest manifest.
  const dep = await axios.post(`${API}/sites/${siteId}/deploys`, { files: digests }, { headers, timeout: TIMEOUT });
  const deployId = dep.data.id;
  const required = dep.data.required || [];
  const pathBySha = {};
  for (const [p, sha] of Object.entries(digests)) pathBySha[sha] = p;

  // 3. Upload only the SHAs Netlify asks for.
  for (const sha of required) {
    const p = pathBySha[sha];
    if (!p) continue;
    console.log(`  uploading ${p} (${sha.slice(0, 8)})`);
    await axios.put(`${API}/deploys/${deployId}/files${p}`, buffers[p], {
      headers: { Authorization: `Bearer ${env.netlify.token}`, 'Content-Type': 'application/octet-stream' },
      timeout: TIMEOUT,
    });
  }
  if (!required.length) console.log('  all files cached — nothing to upload');

  // 4. Wait for the deploy to finish.
  let ready = false;
  for (let i = 0; i < 30 && !ready; i++) {
    const s = await axios.get(`${API}/deploys/${deployId}`, { headers, timeout: TIMEOUT });
    if (s.data.state === 'ready') ready = true;
    else if (s.data.state === 'error') throw new Error(`Deploy failed: ${s.data.error_message || 'unknown'}`);
    else await new Promise((r) => setTimeout(r, 2000));
  }
  console.log(`Deploy ${ready ? 'ready' : 'still processing'}: https://${siteName}.netlify.app`);

  // 5. Attach the custom subdomain on the Netlify side.
  await addCustomDomainToNetlify(siteId, subdomain);

  console.log('\n================= DONE (Netlify side) =================');
  console.log(`Netlify URL : https://${siteName}.netlify.app`);
  console.log(`Attached    : ${subdomain}`);
  console.log('\n>>> ADD THIS DNS RECORD where pixiebot.co is managed (GoDaddy):');
  console.log(`    Type : CNAME`);
  console.log(`    Host : ${subdomain.split('.')[0]}`);
  console.log(`    Value: ${siteName}.netlify.app`);
  console.log(`    TTL  : default (e.g. 1 hour)`);
  console.log('\nAfter the record propagates, Netlify auto-provisions SSL and');
  console.log(`https://${subdomain} goes live.`);
}

main().catch((e) => {
  console.error('FAILED:', e.response ? `${e.response.status} ${JSON.stringify(e.response.data)}` : e.message);
  process.exit(1);
});
