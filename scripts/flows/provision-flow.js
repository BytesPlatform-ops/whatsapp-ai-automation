#!/usr/bin/env node
/**
 * One-stop WhatsApp Flow provisioning for Pixie's website-builder Flow.
 *
 * Runs the Meta-side setup the dynamic /flow endpoint can't do itself:
 *   genkeys   — generate RSA-2048 keypair (prints PEM for .env)
 *   upload-key — upload the public key to one or both phone numbers
 *   create    — create the Flow on the WABA (prints FLOW_ID)
 *   upload    — upload src/flows/flow.json as the Flow's FLOW_JSON asset
 *   publish   — publish the Flow
 *   status    — show Flow + endpoint health
 *
 * Requires a token with whatsapp_business_management (+ messaging). The
 * spec calls it META_TOKEN; this script reads, in order:
 *   META_FLOW_TOKEN → META_TOKEN → WHATSAPP_ACCESS_TOKEN
 * (META_CAPI_ACCESS_TOKEN is intentionally NOT used — it's a dataset-scoped
 *  token with only read_ads_dataset_quality and fails Flow management.)
 *
 * Usage:
 *   node -r dotenv/config scripts/flows/provision-flow.js genkeys
 *   node -r dotenv/config scripts/flows/provision-flow.js upload-key
 *   node -r dotenv/config scripts/flows/provision-flow.js create
 *   node -r dotenv/config scripts/flows/provision-flow.js upload
 *   node -r dotenv/config scripts/flows/provision-flow.js publish
 *   node -r dotenv/config scripts/flows/provision-flow.js status
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const API = 'https://graph.facebook.com/v22.0';
const WABA = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '946247001439181';
const TOKEN =
  process.env.META_FLOW_TOKEN ||
  process.env.META_TOKEN ||
  process.env.WHATSAPP_ACCESS_TOKEN;
const FLOW_ID = process.env.PIXIE_FLOW_ID || '';
const ENDPOINT_URI = process.env.FLOW_ENDPOINT_URI || 'https://pixiebot.co/flow';

// Phone number ids: comma-separated env, else fall back to the single
// WHATSAPP_PHONE_NUMBER_ID.
function phoneIds() {
  const raw = process.env.FLOW_PHONE_NUMBER_IDS || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

if (!TOKEN) {
  console.error('No token found. Set META_FLOW_TOKEN (or META_TOKEN) with whatsapp_business_management scope.');
  process.exit(1);
}

function req(method, urlPath, { json, form, headers } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(API + urlPath);
    const opts = { method, headers: { Authorization: `Bearer ${TOKEN}`, ...(headers || {}) } };
    let payload = null;
    if (json) {
      payload = JSON.stringify(json);
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(payload);
    } else if (form) {
      payload = form.body;
      Object.assign(opts.headers, form.headers);
    }
    const r = https.request(url, opts, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

function urlencoded(obj) {
  const body = Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return { body, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } };
}

async function genkeys() {
  const dir = path.join(__dirname, '.keys');
  fs.mkdirSync(dir, { recursive: true });
  const priv = path.join(dir, 'private.pem');
  const pub = path.join(dir, 'public.pem');
  // No passphrase — keeps the endpoint env simple. Restrict file perms.
  execSync(`openssl genrsa -out "${priv}" 2048`, { stdio: 'ignore' });
  execSync(`openssl rsa -in "${priv}" -pubout -out "${pub}"`, { stdio: 'ignore' });
  fs.chmodSync(priv, 0o600);
  const privPem = fs.readFileSync(priv, 'utf8');
  console.log('\n✅ Keys generated in scripts/flows/.keys/ (gitignored).');
  console.log('\nAdd the PRIVATE key to your server env. PREFERRED — base64 (a single');
  console.log('clean token; no newlines/quotes for a dashboard to mangle):\n');
  console.log('WHATSAPP_FLOW_PRIVATE_KEY_B64=' + Buffer.from(privPem, 'utf8').toString('base64'));
  console.log('\n(Alternative \\n-escaped form, only for .env files — dashboards mangle it):');
  console.log('WHATSAPP_FLOW_PRIVATE_KEY="' + privPem.trim().replace(/\n/g, '\\n') + '"');
  console.log('\nThen run: provision-flow.js upload-key\n');
}

async function uploadKey() {
  const pub = path.join(__dirname, '.keys', 'public.pem');
  if (!fs.existsSync(pub)) { console.error('No public.pem — run genkeys first.'); process.exit(1); }
  const pem = fs.readFileSync(pub, 'utf8');
  const ids = phoneIds();
  if (!ids.length) { console.error('No phone number ids — set FLOW_PHONE_NUMBER_IDS or WHATSAPP_PHONE_NUMBER_ID.'); process.exit(1); }
  for (const id of ids) {
    const r = await req('POST', `/${id}/whatsapp_business_encryption`, { form: urlencoded({ business_public_key: pem }) });
    console.log(`upload-key ${id}:`, r.status, JSON.stringify(r.body));
  }
}

async function create() {
  const r = await req('POST', `/${WABA}/flows`, {
    json: { name: 'Pixie Website Builder', categories: ['LEAD_GENERATION'], endpoint_uri: ENDPOINT_URI },
  });
  console.log('create:', r.status, JSON.stringify(r.body));
  if (r.body && r.body.id) console.log(`\nAdd to .env:  PIXIE_FLOW_ID=${r.body.id}\n`);
}

async function upload() {
  if (!FLOW_ID) { console.error('Set PIXIE_FLOW_ID first (run create).'); process.exit(1); }
  const flowJson = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'flows', 'flow.json'));
  // multipart/form-data with the flow.json file
  const boundary = '----pixieflow' + Date.now();
  const parts = [];
  const push = (s) => parts.push(Buffer.from(s, 'utf8'));
  push(`--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\nflow.json\r\n`);
  push(`--${boundary}\r\nContent-Disposition: form-data; name="asset_type"\r\n\r\nFLOW_JSON\r\n`);
  push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="flow.json"\r\nContent-Type: application/json\r\n\r\n`);
  parts.push(flowJson);
  push(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat(parts);
  const r = await req('POST', `/${FLOW_ID}/assets`, {
    form: { body, headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length } },
  });
  console.log('upload:', r.status, JSON.stringify(r.body));
}

async function publish() {
  if (!FLOW_ID) { console.error('Set PIXIE_FLOW_ID first.'); process.exit(1); }
  const r = await req('POST', `/${FLOW_ID}/publish`);
  console.log('publish:', r.status, JSON.stringify(r.body));
}

async function status() {
  console.log('WABA:', WABA, '| FLOW_ID:', FLOW_ID || '(unset)', '| endpoint:', ENDPOINT_URI);
  console.log('phone ids:', phoneIds().join(', ') || '(none)');
  const flows = await req('GET', `/${WABA}/flows?fields=id,name,status,categories`);
  console.log('flows:', flows.status, JSON.stringify(flows.body));
  if (FLOW_ID) {
    const f = await req('GET', `/${FLOW_ID}?fields=id,name,status,validation_errors,health_status`);
    console.log('flow detail:', f.status, JSON.stringify(f.body));
  }
}

const cmd = process.argv[2];
const cmds = { genkeys, 'upload-key': uploadKey, create, upload, publish, status };
if (!cmds[cmd]) {
  console.log('Commands: genkeys | upload-key | create | upload | publish | status');
  process.exit(1);
}
cmds[cmd]().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
