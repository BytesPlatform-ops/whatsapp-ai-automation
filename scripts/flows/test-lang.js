'use strict';

// Offline regression for isLowSignal — the guard that decides whether the
// Flow language detector runs the LLM or falls back to the phone map.
//
// Bug it locks down: a "< 4 chars" threshold treated common greetings
// ("oi", "olá") as low-signal, so they never reached the LLM and PT users
// got an English flow-offer + form. Greetings with >=2 letters MUST reach
// the detector; only genuinely signal-less input (1 letter, bare emoji,
// punctuation/digits) falls back to the phone map.
//
//   node scripts/flows/test-lang.js
//
// Pure / no network. Exits non-zero on any failure.

const assert = require('assert');
const { isLowSignal } = require('../../src/flows/lang');

let pass = 0;
function check(input, expected) {
  assert.strictEqual(
    isLowSignal(input), expected,
    `isLowSignal(${JSON.stringify(input)}) should be ${expected}`
  );
  console.log('  ✓', JSON.stringify(input).padEnd(8), '→ lowSignal=' + expected);
  pass++;
}

// Greetings / real words — must NOT be low-signal so the LLM detects them.
['oi', 'olá', 'ola', 'hi', 'hey', 'hola', 'yo', 'ok', 'bonjour'].forEach((g) => check(g, false));

// Genuinely signal-less — low-signal, fall back to the phone map.
['', ' ', 'a', 'é', '👋', '🙏🏽', '123', '!!', '7', '.'].forEach((g) => check(g, true));

console.log(`\n${pass} isLowSignal checks passed.`);
