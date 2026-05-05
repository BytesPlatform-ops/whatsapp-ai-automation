#!/usr/bin/env node
// Fixture-based regression runner.
//
// Usage:
//   node test/replay.js                          # run every fixture under test/fixtures/
//   node test/replay.js fixtures/02_*.json       # run specific files
//   node test/replay.js --list                   # print fixture names + descriptions, no run
//
// Each fixture is a saved tester convo turning a real bug into a
// permanent regression test. Runner replays the convo turn-by-turn
// against the actual router (real LLM, real DB, mocked outbound) and
// asserts against the per-turn `expect` block. Any assertion failure
// fails the run with a diff readable by a human.
//
// IMPORTANT: this is a real-LLM runner, not a mock. Each full sweep
// costs ~$0.05-0.20 in OpenAI tokens depending on fixture length.
// Run before push, not on every commit.

// ─── Mock outbound BEFORE loading anything else ──────────────────
// Required because router.js destructures sender exports at load
// time. If we mock after the require, the destructured locals still
// hold the real (network-hitting) functions.
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { installMocks, getCaptured, clearCaptured, capturedReplyText } = require('./lib/mockSender');
installMocks();

// Now safe to load the rest of the app
const { routeMessage } = require('../src/conversation/router');
const { getUserByPhone, deleteTestUser, newTestPhone, seedUser } = require('./lib/testUser');
const { runExpectations } = require('./lib/assertions');

// ─── Helpers ─────────────────────────────────────────────────────

const FIXTURE_DIR = path.resolve(__dirname, 'fixtures');

function listFixtureFiles(args) {
  if (args.length === 0) {
    if (!fs.existsSync(FIXTURE_DIR)) return [];
    return fs.readdirSync(FIXTURE_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => path.join(FIXTURE_DIR, f));
  }
  // Each arg is treated as a path/glob — basic resolution only (no glob
  // expansion). Globbing is left to the shell so this script stays
  // dependency-free.
  return args.map((a) => path.resolve(process.cwd(), a)).filter((p) => fs.existsSync(p));
}

function loadFixture(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return { file, ...JSON.parse(raw) };
}

function buildMessage(turn, phone, channel, turnIndex) {
  // Synthesize a router-shaped message object. Keep field names
  // identical to what parseWebhookPayload produces so the router
  // path runs the same code as production.
  const m = {
    from: phone,
    channel: channel || 'whatsapp',
    type: turn.type || 'text',
    text: turn.user || '',
    messageId: `test_msg_${phone}_${turnIndex}`,
    phoneNumberId: null,
  };
  // Optional fields: buttonId, listId, latitude/longitude, mediaId, etc.
  // Fixture authors add them via turn.extra so the runner doesn't have
  // to know each shape.
  if (turn.extra && typeof turn.extra === 'object') {
    Object.assign(m, turn.extra);
  }
  if (turn.buttonId) m.buttonId = turn.buttonId;
  if (turn.listId) m.listId = turn.listId;
  return m;
}

function fmtErrors(errors) {
  return errors.map((e) => `      ✗ ${e}`).join('\n');
}

// ─── Per-fixture runner ──────────────────────────────────────────

async function runFixture(fixture) {
  const phone = newTestPhone(fixture.name || path.basename(fixture.file, '.json'));
  const channel = fixture.channel || 'whatsapp';
  let userId = null;
  let turnsPassed = 0;
  let firstFailure = null;

  // eslint-disable-next-line no-console
  console.log(`\n▶ ${fixture.name}  (${fixture.turns.length} turns) — ${path.basename(fixture.file)}`);
  if (fixture.description) console.log(`  ${fixture.description}`);

  // Optional seed: pre-create the user at a specific state + metadata
  // so the fixture can isolate ONE specific regression instead of
  // navigating the full LLM-driven flow to get there. Use this when
  // the bug only reproduces at a deep state (e.g. WEB_COLLECT_CONTACT)
  // and the path leading there is tangential noise.
  if (fixture.seed && (fixture.seed.state || fixture.seed.metadata)) {
    try {
      const seeded = await seedUser(phone, {
        state: fixture.seed.state,
        metadata: fixture.seed.metadata,
        channel,
      });
      userId = seeded.id;
      // eslint-disable-next-line no-console
      console.log(`  ⛺ seed: state=${seeded.state} metadata=${JSON.stringify(fixture.seed.metadata).slice(0, 80)}…`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(`  ✗ seed failed: ${err.message}`);
      return { name: fixture.name, file: fixture.file, pass: false, turnsPassed: 0, turnsTotal: fixture.turns.length, error: `seed: ${err.message}` };
    }
  }

  try {
    for (let i = 0; i < fixture.turns.length; i++) {
      const turn = fixture.turns[i];
      clearCaptured();
      const message = buildMessage(turn, phone, channel, i);
      const userPreview = (turn.user || `[${turn.type || 'text'}]`).slice(0, 60);

      const turnStart = Date.now();
      try {
        await routeMessage(message);
      } catch (err) {
        firstFailure = `turn ${i + 1} ("${userPreview}"): routeMessage threw: ${err.message}`;
        break;
      }
      const turnMs = Date.now() - turnStart;

      // Read fresh user state for assertions
      const user = await getUserByPhone(phone);
      if (!user) {
        firstFailure = `turn ${i + 1} ("${userPreview}"): no user row found after routeMessage`;
        break;
      }
      userId = user.id;

      const captured = getCaptured();
      const replyText = capturedReplyText();

      const errors = runExpectations(turn.expect, user, captured, replyText);
      const replyPreview = (replyText || '').replace(/\s+/g, ' ').slice(0, 80);

      if (errors.length === 0) {
        turnsPassed++;
        // eslint-disable-next-line no-console
        console.log(`  ✓ turn ${i + 1} (${turnMs}ms) "${userPreview}" → state=${user.state} | "${replyPreview}"`);
      } else {
        // eslint-disable-next-line no-console
        console.log(`  ✗ turn ${i + 1} (${turnMs}ms) "${userPreview}" → state=${user.state} | "${replyPreview}"`);
        // eslint-disable-next-line no-console
        console.log(fmtErrors(errors));
        firstFailure = `turn ${i + 1}: ${errors[0]}`;
        break;
      }
    }
  } finally {
    // Always cleanup, even on assertion failure
    if (userId) {
      try {
        await deleteTestUser(userId);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`  ! cleanup warning for ${phone}: ${err.message}`);
      }
    } else {
      // No userId resolved — try to find by phone in case findOrCreateUser
      // succeeded but we crashed before reading it back.
      try {
        const u = await getUserByPhone(phone);
        if (u) await deleteTestUser(u.id);
      } catch (_) {}
    }
  }

  return {
    name: fixture.name,
    file: fixture.file,
    pass: !firstFailure,
    turnsPassed,
    turnsTotal: fixture.turns.length,
    error: firstFailure,
  };
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list')) {
    const files = listFixtureFiles([]);
    files.forEach((f) => {
      try {
        const fx = loadFixture(f);
        // eslint-disable-next-line no-console
        console.log(`${path.basename(f).padEnd(50)}  ${fx.name || ''}  ${fx.description ? '— ' + fx.description : ''}`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.log(`${path.basename(f).padEnd(50)}  [load failed: ${err.message}]`);
      }
    });
    return process.exit(0);
  }

  const files = listFixtureFiles(args.filter((a) => !a.startsWith('--')));
  if (files.length === 0) {
    // eslint-disable-next-line no-console
    console.log('No fixtures matched. Drop JSON files into test/fixtures/.');
    return process.exit(0);
  }

  const results = [];
  for (const f of files) {
    let fx;
    try {
      fx = loadFixture(f);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log(`✗ ${path.basename(f)}: failed to parse fixture: ${err.message}`);
      results.push({ name: path.basename(f), file: f, pass: false, error: `parse: ${err.message}`, turnsPassed: 0, turnsTotal: 0 });
      continue;
    }
    const r = await runFixture(fx);
    results.push(r);
  }

  // ─── Summary ───────────────────────────────────────────────────
  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  // eslint-disable-next-line no-console
  console.log(`\n────────── Summary ──────────`);
  // eslint-disable-next-line no-console
  console.log(`${results.length} fixture(s) | ${passed} passed | ${failed} failed`);
  if (failed > 0) {
    // eslint-disable-next-line no-console
    console.log(`\nFailed fixtures:`);
    results.filter((r) => !r.pass).forEach((r) => {
      // eslint-disable-next-line no-console
      console.log(`  ✗ ${r.name || path.basename(r.file)}  —  ${r.error}`);
    });
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled error in replay runner:', err);
  process.exit(2);
});
