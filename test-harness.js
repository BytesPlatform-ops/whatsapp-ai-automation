#!/usr/bin/env node
/**
 * test-harness.js
 *
 * Drives the real router with synthetic inbound messages to simulate a
 * "dumb" user ordering a salon website. Intercepts the sender module so
 * nothing is actually sent to WhatsApp — every outbound call is captured
 * to an in-memory transcript.
 *
 * The transcript is written to TEST_TRANSCRIPT.md at the end.
 *
 * Uses: real Supabase DB (writes a test user, cleans up at the end),
 * real LLM (OpenAI). No WhatsApp / Netlify calls.
 */

'use strict';

// Tune the message buffer's quiet window down for tests — otherwise
// every text turn would wait 3 seconds for the buffer to flush.
// 120ms is tight enough to be fast yet wide enough that a rapid-burst
// test (sending 3 messages back-to-back with no awaits between them)
// still batches them into a single flush.
process.env.MESSAGE_BUFFER_QUIET_MS = '120';

require('dotenv').config();

const path = require('path');
const fs = require('fs');

// ── Stub 1: Netlify deployer ────────────────────────────────────────────
require.cache[require.resolve('./src/website-gen/deployer')] = {
  exports: {
    deployToNetlify: async () => ({
      previewUrl: 'https://example.netlify.app/FAKE-PREVIEW',
      netlifySiteId: 'fake-site-id',
      netlifySubdomain: 'fake-subdomain',
    }),
  },
};

// ── Stub 2: Sender module ───────────────────────────────────────────────
const transcript = [];
function captureBot(type, text, extras = {}) {
  transcript.push({ role: 'bot', type, text, ...extras, at: Date.now() });
  console.log(`\n🤖 BOT [${type}]: ${String(text || '').slice(0, 400)}${extras.buttons ? '\n   buttons: ' + JSON.stringify(extras.buttons) : ''}`);
}

// Track last buttons per phone for digit-to-button mapping (Task 12).
const _testLastButtons = new Map();

require.cache[require.resolve('./src/messages/sender')] = {
  exports: {
    sendTextMessage: async (_to, text) => captureBot('text', text),
    sendInteractiveButtons: async (_to, body, buttons) => {
      if (Array.isArray(buttons)) _testLastButtons.set(_to, { buttons, at: Date.now() });
      captureBot('buttons', body, { buttons: buttons.map((b) => `${b.id}:${b.title}`) });
    },
    sendInteractiveList: async (_to, body, buttonText, sections) =>
      captureBot('list', body, { buttonText, sections: JSON.stringify(sections).slice(0, 200) }),
    sendWithMenuButton: async (_to, text) => captureBot('with_menu', text),
    sendCTAButton: async (_to, body, buttonText, url) =>
      captureBot('cta', body, { buttonText, url }),
    sendDocument: async (_to, docUrl, caption, filename) =>
      captureBot('document', caption, { filename, docUrl }),
    sendDocumentBuffer: async (_to, buf, caption, filename) =>
      captureBot('document_buffer', caption, { filename, bytes: buf?.length || 0 }),
    sendImage: async (_to, url, caption) => captureBot('image', caption, { url }),
    markAsRead: async () => {},
    downloadMedia: async () => ({ buffer: Buffer.from(''), mimeType: 'image/png' }),
    showTyping: async () => {},
    setLastMessageId: () => {},
    getLastButtons: (to) => {
      const entry = _testLastButtons.get(to);
      if (!entry) return null;
      if (Date.now() - entry.at > 10 * 60 * 1000) return null;
      return entry.buttons;
    },
  },
};

// Also stub channel-specific senders so anything that imports them directly is safe.
const noopSender = {
  sendTextMessage: async () => {},
  sendInteractiveButtons: async () => {},
  sendInteractiveList: async () => {},
  sendWithMenuButton: async () => {},
  sendCTAButton: async () => {},
  sendDocument: async () => {},
  sendDocumentBuffer: async () => {},
  sendImage: async () => {},
  markAsRead: async () => {},
  downloadMedia: async () => ({ buffer: Buffer.from(''), mimeType: 'image/png' }),
  showTyping: async () => {},
  setLastMessageId: () => {},
};
require.cache[require.resolve('./src/messages/whatsappSender')] = { exports: noopSender };
try {
  const p = require.resolve('./src/messages/messengerSender');
  require.cache[p] = { exports: noopSender };
} catch {}

// ── Now we can safely import the router + DB helpers ────────────────────
const { routeMessage } = require('./src/conversation/router');
const { supabase } = require('./src/config/database');
const { updateUserState, findOrCreateUser, updateUserMetadata } = require('./src/db/users');
const { STATES } = require('./src/conversation/states');

// ── Test phone — unique per run so we don't clash with a live user ──────
const TEST_PHONE = '+19995550' + String(Math.floor(Math.random() * 900) + 100).padStart(3, '0');
const PHONE_ID = '1036360336227904';

let turnCounter = 0;
function logUser(text, kind = 'text') {
  transcript.push({ role: 'user', type: kind, text, at: Date.now() });
  console.log(`\n👤 USER [${kind}]: ${text}`);
}

async function send(text) {
  turnCounter++;
  logUser(text);
  await routeMessage({
    from: TEST_PHONE,
    messageId: `test-${Date.now()}-${turnCounter}`,
    channel: 'whatsapp',
    phoneNumberId: PHONE_ID,
    type: 'text',
    text,
  });
  await new Promise((r) => setTimeout(r, 50));
}

async function sendButton(buttonId, title) {
  turnCounter++;
  logUser(`[button: ${title}]`, 'button');
  await routeMessage({
    from: TEST_PHONE,
    messageId: `test-${Date.now()}-${turnCounter}`,
    channel: 'whatsapp',
    phoneNumberId: PHONE_ID,
    type: 'interactive',
    text: title,
    buttonId,
  });
  await new Promise((r) => setTimeout(r, 50));
}

/**
 * Rapid-burst helper: fire messages without awaiting between them so
 * they all land in the same buffer window, then await the flush.
 */
async function sendBurst(texts) {
  const { flushAll } = require('./src/conversation/messageBuffer');
  for (const t of texts) {
    turnCounter++;
    logUser(t);
    // Fire-and-forget; do NOT await routeMessage here.
    routeMessage({
      from: TEST_PHONE,
      messageId: `test-${Date.now()}-${turnCounter}-${Math.random()}`,
      channel: 'whatsapp',
      phoneNumberId: PHONE_ID,
      type: 'text',
      text: t,
    }).catch(() => {});
    // Tiny microsleep so they arrive in order but well within QUIET_MS.
    await new Promise((r) => setImmediate(r));
  }
  await flushAll();
  // Let any queued sends settle.
  await new Promise((r) => setTimeout(r, 200));
}

async function forceState(state) {
  const user = await findOrCreateUser(TEST_PHONE, 'whatsapp', PHONE_ID);
  await updateUserState(user.id, state);
  transcript.push({ role: 'system', text: `-- forced state → ${state} --`, at: Date.now() });
  console.log(`\n[harness] forced state → ${state}`);
}

async function cleanup() {
  try {
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .eq('phone_number', TEST_PHONE);
    if (users && users.length) {
      for (const u of users) {
        await supabase.from('conversations').delete().eq('user_id', u.id);
        await supabase.from('sites').delete().eq('user_id', u.id);
      }
      await supabase.from('users').delete().eq('phone_number', TEST_PHONE);
      console.log(`\n🧹 Cleaned up ${users.length} test user(s) for ${TEST_PHONE}`);
    }
  } catch (err) {
    console.warn('cleanup failed:', err.message);
  }
}

async function writeTranscript() {
  const lines = [
    '# Pixie Bot — Dumb-User Test Transcript',
    '',
    `_Test phone: ${TEST_PHONE} · Date: ${new Date().toISOString()}_`,
    '',
    "Simulated a clueless customer trying to get a salon website. The goal is to stress-test the refactored intent helpers (affirm / skip / change), the new prompt wording, and the confirmation + revision flow. The \"user\" is intentionally vague, changes their mind mid-flow, mixes spellings, delegates to the bot, skips optional steps, and pokes at edge cases.",
    '',
    '---',
    '',
  ];
  for (const entry of transcript) {
    if (entry.role === 'system') {
      lines.push(`> _${entry.text}_`);
      lines.push('');
      continue;
    }
    if (entry.role === 'user') {
      if (entry.type === 'button') {
        lines.push(`**👤 User** _(button tap)_: \`${entry.text}\``);
      } else {
        lines.push(`**👤 User**: ${entry.text}`);
      }
    } else {
      const ex = { ...entry };
      delete ex.role;
      delete ex.at;
      delete ex.type;
      delete ex.text;
      let suffix = '';
      if (entry.type === 'buttons' && ex.buttons) {
        suffix = `\n   _buttons: ${ex.buttons.join(', ')}_`;
      } else if (entry.type === 'cta' && ex.url) {
        suffix = `\n   _CTA → ${ex.buttonText}: ${ex.url}_`;
      } else if (entry.type === 'with_menu') {
        suffix = `\n   _(with menu button)_`;
      } else if (entry.type === 'list') {
        suffix = `\n   _(interactive list: ${ex.buttonText})_`;
      } else if (entry.type === 'image') {
        suffix = `\n   _image: ${ex.url}_`;
      }
      lines.push(`**🤖 Pixie** _(${entry.type})_: ${entry.text || '(no body)'}${suffix}`);
    }
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  const outPath = path.resolve(__dirname, 'TEST_TRANSCRIPT.md');
  fs.writeFileSync(outPath, lines.join('\n'));
  console.log(`\n📝 Transcript written to ${outPath}`);
}

async function main() {
  console.log(`\n🧪 Running dumb-user salon flow test\n   phone=${TEST_PHONE}\n`);

  try {
    // ── Phase 1: Opening (sales bot) ─────────────────────────────────────
    await send('hi');
    await send('i want a website for my salon');

    // Jump the user directly into WEB_COLLECTING to exercise the flow we
    // just refactored. Otherwise the sales bot may loop asking for calls.
    await forceState(STATES.WEB_COLLECT_NAME);
    await send('hmm');                     // Vague → bot should re-prompt
    await send('Glow Studio');             // Business name

    // Phase 2: Email (optional — test the isSkip path)
    await send('nah dont have one');       // Should take the skip path

    // Phase 3: Industry
    await send('salon');                   // Simple industry

    // Phase 4: Services — dumps a long list
    await send('haircut, hair color, nails, pedicure, manicure, facials, threading');

    // Phase 5: Salon sub-flow — booking tool
    await send('wuts that');               // Confused
    await send('nope we dont have one');   // Should trigger "native"

    // Phase 6: Instagram — skip with delegation
    await send('whatever you think');

    // Phase 7: Hours — default
    await send('default');

    // Phase 8: Service durations — skip
    await send('idk just use default');

    // Phase 9: Contact — partial
    await send('03001234567 and glowstudio@example.com');

    // Phase 10: Confirm — ambiguous reply first
    await send('hmm');                     // Should re-prompt
    // Task 0.2 regression: edit intent at contact prefill must NOT be
    // parsed as a street address — should route to WEB_CONFIRM.
    await send('actually the name is Glow Studio Salon not just Glow Studio');
    await send('looks good to me');        // Affirmative → should build

    // After website generated (fake Netlify), revision flow
    await send('yea its fine');            // Approve

    // Custom domain offer
    // Task 0.3 regression: confused question must NOT auto-search.
    await send('wait wut is domain');
    // Task 0.4 regression: skip phrase during DOMAIN_SEARCH/OFFER must exit.
    await send('nah skip for now');

    // Closing
    await send('thx');

    // ── Task 12: digit-to-button fallback ───────────────────────────────
    // Bot just sent interactive buttons (at payment). User types "1"
    // instead of tapping the button. Should map to the first button.
    transcript.push({ role: 'system', text: '-- Task 12 probe: digit-to-button --', at: Date.now() });
    await forceState(STATES.SERVICE_SELECTION);
    await send('hello');  // triggers service selection buttons
    await send('2');      // should map to 2nd button (🌐 Website)

    // ── Task 0.1: informativeBot crash smoke test ───────────────────────
    // Force INFORMATIVE_CHAT state and ask a mid-flow question. If
    // getRecentMessages was still broken, every reply would be "Sorry,
    // I'm having trouble right now". Now it should respond with actual
    // FAQ info.
    transcript.push({ role: 'system', text: '-- Task 0.1 probe: INFORMATIVE_CHAT --', at: Date.now() });
    await forceState(STATES.INFORMATIVE_CHAT);
    await send('how much does a website cost');
    await send('what does Bytes Platform do');

    // ── Task 1: Objection handler ───────────────────────────────────────
    // Test all three objection flavors mid-sales. Acceptance: each reply
    // must be empathetic, low-pressure, and offer ONE low-commitment
    // next step. Metadata.objectionTopics should accumulate tags.
    transcript.push({ role: 'system', text: '-- Task 1 probe: objection handler --', at: Date.now() });
    await forceState(STATES.SALES_CHAT);
    // Clear conversation history for a clean sales-bot context
    await send('i want a website');
    // Price objection
    await send('honestly your pricing sounds too expensive, i can just use wix for free');
    // Value objection
    await send('im not sure this is really worth it for a small business like mine');
    // Timing objection
    await send('let me think about it, ill get back to you');

    // ── Task 4: Parameter-chain dump (entityAccumulator) ────────────────
    // User dumps all fields in one message. The analyzer should extract
    // business_name + industry + location + phone; the accumulator
    // persists them to extracted*; webDev hydrates → flow should jump
    // past the name step on arrival.
    transcript.push({ role: 'system', text: '-- Task 4 probe: parameter-chain dump --', at: Date.now() });
    const { clearHistory: ch4 } = require('./src/db/conversations');
    const { findOrCreateUser: fuo4, updateUserMetadata: umd4 } = require('./src/db/users');
    const u4 = await fuo4(TEST_PHONE, 'whatsapp', PHONE_ID);
    await ch4(u4.id);
    await umd4(u4.id, {
      extractedBusinessName: null,
      extractedIndustry: null,
      extractedEmail: null,
      extractedPhone: null,
      extractedServices: null,
      extractedColors: null,
      extractedLocation: null,
      websiteData: null,
      adData: null,
      logoData: null,
      preferredLanguage: null,
      lastAnalyzedLanguage: null,
    });
    await forceState(STATES.SALES_CHAT);
    // The dump — everything in one go
    await send('My business is Fresh Cuts, we\'re a barbershop in Karachi, call me at 0300-1234567 and my email is fresh@example.com');
    await forceState(STATES.WEB_COLLECTING);
    await send('lets build it');     // Trigger WEB_COLLECTING — should see ack of pre-filled fields, ask only missing (services)

    // ── Task 11: Rapid-message buffer ──────────────────────────────────
    // User sends 3 quick messages. Buffer must concat them and the bot
    // must reply ONCE with all 3 fields captured (business name, service,
    // phone) instead of 3 chatty back-to-back replies.
    transcript.push({ role: 'system', text: '-- Task 11 probe: rapid buffer --', at: Date.now() });
    const { updateUserMetadata: umd11 } = require('./src/db/users');
    await umd11(u4.id, {
      websiteData: null,
      extractedBusinessName: null,
      extractedIndustry: null,
      extractedEmail: null,
      extractedPhone: null,
      extractedServices: null,
      extractedLocation: null,
      preferredLanguage: null,
      lastAnalyzedLanguage: null,
    });
    await forceState(STATES.SALES_CHAT);
    await sendBurst([
      'my name is Glow Studio',
      'and I do nails and facials',
      'and my phone is 03001234567',
    ]);

    // ── Task 10: Message dedup ──────────────────────────────────────────
    // Send the SAME messageId twice back-to-back. The second should be
    // silently dropped — no second bot reply.
    transcript.push({ role: 'system', text: '-- Task 10 probe: dedup --', at: Date.now() });
    await forceState(STATES.SALES_CHAT);
    const dupId = `test-dup-${Date.now()}`;
    async function sendFixedId(text, id) {
      turnCounter++;
      logUser(text);
      await routeMessage({
        from: TEST_PHONE,
        messageId: id,
        channel: 'whatsapp',
        phoneNumberId: PHONE_ID,
        type: 'text',
        text,
      });
    }
    await sendFixedId('hello whats up', dupId);
    // Send the exact same messageId within 30s — should be dropped silently.
    await sendFixedId('hello whats up', dupId);

    // ── Task 8: Undo stack ──────────────────────────────────────────────
    // Seed a state history, then send an undo message. Bot should rewind
    // to the previous state, NOT jump to SERVICE_SELECTION.
    transcript.push({ role: 'system', text: '-- Task 8 probe: undo --', at: Date.now() });
    const { updateUserMetadata: umd8 } = require('./src/db/users');
    await umd8(u4.id, {
      stateHistory: [STATES.WEB_COLLECT_NAME, STATES.WEB_COLLECT_INDUSTRY],
      websiteData: { businessName: 'Fresh Cuts', industry: 'barbershop' },
    });
    await forceState(STATES.WEB_COLLECT_SERVICES);
    await send('wait go back');

    // ── Task 7: Session recap after inactivity ──────────────────────────
    // Force user mid-webdev-collect with some saved fields, backdate
    // last conversation row by >30 min, then send "ok back". Bot should
    // open with a recap referencing the saved fields.
    transcript.push({ role: 'system', text: '-- Task 7 probe: session recap --', at: Date.now() });
    const { updateUserMetadata: umd7 } = require('./src/db/users');
    await umd7(u4.id, {
      websiteData: {
        businessName: 'Fresh Cuts',
        industry: 'barbershop',
        services: ['haircut', 'beard trim'],
      },
    });
    await forceState(STATES.WEB_COLLECT_CONTACT);
    // Backdate all conversation rows for this user by 45 minutes
    const { supabase: sb7 } = require('./src/config/database');
    const backdate = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    await sb7.from('conversations').update({ created_at: backdate }).eq('user_id', u4.id);
    await send('ok im back, where were we');

    // ── Task 6: Multi-service queue ──────────────────────────────────────
    // Single message requesting three services. Analyzer must return
    // topicSwitches=[webdev, logo, adgen]; router must ack + queue +
    // route to webdev.
    transcript.push({ role: 'system', text: '-- Task 6 probe: multi-service queue --', at: Date.now() });
    const { updateUserMetadata: umd6 } = require('./src/db/users');
    await umd6(u4.id, {
      serviceQueue: null,
      websiteData: null,
      adData: null,
      logoData: null,
      preferredLanguage: null,
      lastAnalyzedLanguage: null,
    });
    await forceState(STATES.SALES_CHAT);
    await send('i want a website and a logo and some ads for my coffee shop Bean Bar');

    // ── Task 5: Cross-flow carryover (webdev → logo) ────────────────────
    // After the Task 4 probe stored Fresh Cuts as a barbershop, starting
    // the logo flow should skip business name + industry steps because
    // they're already in extracted* / chatbotData.
    transcript.push({ role: 'system', text: '-- Task 5 probe: cross-flow carryover --', at: Date.now() });
    await forceState(STATES.LOGO_COLLECT_BUSINESS); // Will trigger handleStart via default route
    // Send anything (the handler checks metadata on entry before parsing text)
    // Note: in this flow, LOGO_COLLECT_BUSINESS maps to handleCollectBusiness,
    // not handleStart. To test the carryover via handleStart we'd need to
    // enter a different way. Let's clear logoData and re-dispatch through
    // handleStart by forcing an unmapped state.
    const { updateUserMetadata: umd5 } = require('./src/db/users');
    await umd5(u4.id, { logoData: null });
    // Hit handleLogoGeneration with a random state that routes to default (handleStart).
    // Easiest: force state to something that maps to default → handleStart.
    // LOGO_CREATING_IMAGE maps to handleStart per the switch.
    await forceState(STATES.LOGO_CREATING_IMAGE);
    await send('start the logo please');

    // ── Task 3: Smart defaults on delegation ────────────────────────────
    // Logo flow: skip both colors + symbol. Bot must apply industry
    // defaults and state what it picked.
    transcript.push({ role: 'system', text: '-- Task 3 probe: smart defaults --', at: Date.now() });
    await forceState(STATES.LOGO_COLLECT_BUSINESS);
    await send('Glow Studio Salon');
    await send('salon');
    await send('we do hair color, nails and facials');
    // Style step uses buttons — send a style tap
    await sendButton('logo_style_modern', '⚡ Modern');
    // Colors — delegate
    await send('whatever you think');
    // Symbol — delegate
    await send('idk you pick');

    // ── Task 2: Language switching (Urdu) ───────────────────────────────
    // A fresh user who writes in Roman Urdu. Need TWO consecutive turns
    // in Urdu before preferredLanguage is set, so send two Urdu messages
    // first, then verify the third bot reply is in Urdu.
    transcript.push({ role: 'system', text: '-- Task 2 probe: language switching (Urdu) --', at: Date.now() });
    // Reset state + clear history to simulate a new Urdu-speaking lead
    const { clearHistory } = require('./src/db/conversations');
    const { findOrCreateUser: findUser2, updateUserMetadata: updMeta2 } = require('./src/db/users');
    const existingUser = await findUser2(TEST_PHONE, 'whatsapp', PHONE_ID);
    await clearHistory(existingUser.id);
    await updMeta2(existingUser.id, {
      preferredLanguage: null,
      lastAnalyzedLanguage: null,
      frustrationCount: 0,
      objectionTopics: [],
    });
    await forceState(STATES.SALES_CHAT);
    await send('Salaam bhai, mujhe apne salon ka website chahiye');  // Urdu turn 1
    await send('Theek hai, kitne paise lagenge?');                    // Urdu turn 2 — should flip pref
    await send('Ye bohot expensive lagta hai yaar');                  // Urdu + objection
    await send('Acha chalo preview dikhao pehle');                    // Urdu follow-up
  } catch (err) {
    transcript.push({ role: 'bot', type: 'error', text: `TEST HARNESS CAUGHT ERROR: ${err.message}`, at: Date.now() });
    console.error('test harness error:', err);
  } finally {
    await writeTranscript();
    await cleanup();
    process.exit(0);
  }
}

// Safety: hard timeout.
setTimeout(() => {
  console.error('\n⏱️  Global 9-min timeout hit — writing what we have and exiting.');
  writeTranscript().then(cleanup).finally(() => process.exit(2));
}, 9 * 60 * 1000).unref();

main();
