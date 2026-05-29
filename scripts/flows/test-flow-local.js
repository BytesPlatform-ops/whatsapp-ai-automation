#!/usr/bin/env node
/**
 * Local, offline test harness for the WhatsApp Flow endpoint.
 *
 * Proves — WITHOUT Meta or a deployed server — that:
 *   1. The encryption round-trip works (we simulate Meta's client:
 *      RSA-OAEP the AES key with our PUBLIC key, AES-GCM the body; the
 *      endpoint decrypts, handles, and re-encrypts with the flipped IV;
 *      we decrypt the response the way Meta would).
 *   2. The screen state machine routes correctly: ping → INIT → COMMON →
 *      THEME (per classified theme) → FINISH → SUCCESS.
 *   3. classifyTheme picks the right Screen-2 questions per industry.
 *
 * The session store (Supabase) is stubbed so this runs with zero network.
 *
 * Run:  node scripts/flows/test-flow-local.js
 */

const crypto = require('crypto');
const Module = require('module');

// ── Stub the store + logger so endpoint.js needs no DB/network ──────────
const sessionMem = {};
const storeStub = {
  async createSession(s) { sessionMem[s.flowToken] = { ...s, answers: {} }; return sessionMem[s.flowToken]; },
  async getSession(t) { return sessionMem[t] || null; },
  async patchSession(t, { answersPatch, theme, lang } = {}) {
    const s = sessionMem[t] || (sessionMem[t] = { flow_token: t, answers: {} });
    s.answers = { ...(s.answers || {}), ...(answersPatch || {}) };
    if (theme !== undefined) s.theme = theme;
    if (lang !== undefined) s.lang = lang;
    return s;
  },
  async markSubmitted(t) { if (sessionMem[t]) sessionMem[t].status = 'submitted'; return sessionMem[t]; },
};

// Intercept require('./store') from within src/flows/endpoint.js.
const origResolve = Module._resolveFilename;
const path = require('path');
const storePath = path.join(__dirname, '..', '..', 'src', 'flows', 'store.js');
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && /src[\\/]flows[\\/]endpoint\.js$/.test(parent.filename) && request === './store') {
    return storeStub;
  }
  return origLoad.apply(this, arguments);
};

const c = require('../../src/flows/crypto');
const { handleFlow } = require('../../src/flows/endpoint');
const { classifyTheme } = require('../../src/flows/questionBank');

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

// Throwaway keypair standing in for the one we'd upload to Meta.
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Drive one encrypted request through the endpoint and decrypt the reply,
// exactly mirroring routes.js (decrypt → handleFlow → encrypt).
async function roundtrip(reqObj) {
  const sim = c._simulateClientEncrypt(reqObj, publicKey);
  const { decrypted, aesKeyBuffer, initialVectorBuffer } = c.decryptRequest(sim, privateKey);
  const respObj = await handleFlow(decrypted, {});
  const b64 = c.encryptResponse(respObj, aesKeyBuffer, initialVectorBuffer);
  // Decrypt response as Meta would: same key, IV flipped.
  const flipped = Buffer.from(sim._iv.map((b) => b ^ 0xff));
  const buf = Buffer.from(b64, 'base64');
  const tag = buf.subarray(buf.length - 16);
  const ct = buf.subarray(0, buf.length - 16);
  const d = crypto.createDecipheriv('aes-128-gcm', sim._aesKey, flipped);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8'));
}

(async () => {
  console.log('\n=== 1. Crypto + ping ===');
  const ping = await roundtrip({ action: 'ping', version: '3.0' });
  ok('ping returns {data:{status:active}}', ping?.data?.status === 'active');

  console.log('\n=== 2. INIT → COMMON labels ===');
  const init = await roundtrip({ action: 'INIT', flow_token: 'ft_test1', version: '3.0' });
  ok('INIT returns COMMON screen', init.screen === 'COMMON');
  ok('COMMON has business-name label', typeof init.data.l_name === 'string' && init.data.l_name.length > 0);

  console.log('\n=== 3. classifyTheme ===');
  const themeCases = [
    ['hair salon', 'salon'], ['barbershop', 'salon'], ['HVAC', 'hvac'],
    ['plumber', 'hvac'], ['real estate agent', 'realestate'],
    ['freelance photographer', 'portfolio'], ['coffee shop', 'general'],
  ];
  for (const [ind, exp] of themeCases) ok(`"${ind}" → ${exp}`, classifyTheme(ind) === exp);

  console.log('\n=== 4. Full salon journey (COMMON→THEME→FINISH→SUCCESS) ===');
  const tok = 'ft_salon';
  await storeStub.createSession({ flowToken: tok, lang: 'en' });
  const r1 = await roundtrip({
    action: 'data_exchange', screen: 'COMMON', flow_token: tok,
    data: { business_name: 'Glow Studio', email: 'g@glow.com', industry: 'hair salon' },
  });
  ok('COMMON→THEME', r1.screen === 'THEME');
  ok('theme classified salon (session)', sessionMem[tok].theme === 'salon');
  ok('salon q1 = currency', /currency|moeda/i.test(r1.data.q1_label));
  ok('salon q4 visible', r1.data.q4_visible === true);

  const r2 = await roundtrip({
    action: 'data_exchange', screen: 'THEME', flow_token: tok,
    data: { a1: 'USD', a2: 'no', a3: 'Tue-Sat 9-7', a4: 'Haircut 30min 25' },
  });
  ok('THEME→FINISH', r2.screen === 'FINISH');
  ok('FINISH has contact label', typeof r2.data.l_contact === 'string');

  const r3 = await roundtrip({
    action: 'data_exchange', screen: 'FINISH', flow_token: tok,
    data: { contact_info: 'g@glow.com, +1 555 111 2222' },
  });
  ok('FINISH→SUCCESS', r3.screen === 'SUCCESS');
  ok('SUCCESS carries flow_token', r3.data?.extension_message_response?.params?.flow_token === tok);
  ok('session has all answers persisted',
    sessionMem[tok].answers.business_name === 'Glow Studio' &&
    sessionMem[tok].answers.a1 === 'USD' &&
    sessionMem[tok].answers.contact_info.includes('@'));

  console.log('\n=== 5. HVAC theme hides q3/q4 ===');
  const tok2 = 'ft_hvac';
  await storeStub.createSession({ flowToken: tok2, lang: 'en' });
  const h1 = await roundtrip({
    action: 'data_exchange', screen: 'COMMON', flow_token: tok2,
    data: { business_name: 'CoolAir', email: 'c@air.com', industry: 'HVAC and AC repair' },
  });
  ok('hvac q2 visible', h1.data.q2_visible === true);
  ok('hvac q3 hidden', h1.data.q3_visible === false);
  ok('hvac q4 hidden', h1.data.q4_visible === false);

  console.log('\n=== 6. Portuguese labels ===');
  const tok3 = 'ft_pt';
  await storeStub.createSession({ flowToken: tok3, lang: 'pt' });
  const p1 = await roundtrip({ action: 'INIT', flow_token: tok3, version: '3.0' });
  ok('PT INIT label is Portuguese', /negócio|nome/i.test(p1.data.l_name));

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('Harness crashed:', e); process.exit(1); });
