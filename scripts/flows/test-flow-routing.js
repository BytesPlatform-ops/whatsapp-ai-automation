'use strict';

// Offline regression for per-number Flow id resolution. Flows are WABA-scoped,
// so each phone number on a different WABA needs its OWN published Flow. A
// wrong id silently breaks the offer on that number, so lock the mapping:
//   PIXIE_FLOW_ID_MAP="phoneNumberId:flowId,..." overrides per number;
//   PIXIE_FLOW_ID is the default for any number not in the map.
//
//   node scripts/flows/test-flow-routing.js
//
// No network. Exits non-zero on failure.

const assert = require('assert');

// flowIdForNumber reads process.env at CALL time, so set env before each call.
process.env.PIXIE_FLOW_ID = 'NL_DEFAULT';
process.env.PIXIE_FLOW_ID_MAP = '1047147548486010:US_FLOW, 999:OTHER';
const { flowIdForNumber, flowEnabled } = require('../../src/flows/send');

let pass = 0;
function eq(actual, expected, name) {
  assert.strictEqual(actual, expected, `${name}: ${actual} !== ${expected}`);
  console.log('  ✓', name);
  pass++;
}

eq(flowIdForNumber('1047147548486010'), 'US_FLOW', 'mapped number → its own flow');
eq(flowIdForNumber('1036767402856038'), 'NL_DEFAULT', 'unmapped number → PIXIE_FLOW_ID default');
eq(flowIdForNumber('999'), 'OTHER', 'second map entry (whitespace-tolerant)');
eq(flowIdForNumber(''), 'NL_DEFAULT', 'empty number → default');
eq(flowEnabled('1047148486010'.slice(0)), true, 'flowEnabled true when a default exists');

// No default and not in map → null (offer skipped, never sends a wrong id).
delete process.env.PIXIE_FLOW_ID;
process.env.PIXIE_FLOW_ID_MAP = '1047147548486010:US_FLOW';
eq(flowIdForNumber('1036767402856038'), null, 'no default + not mapped → null');
eq(flowEnabled('1036767402856038'), false, 'flowEnabled false → offer skipped');
eq(flowIdForNumber('1047147548486010'), 'US_FLOW', 'still resolves a mapped number with no default');

console.log(`\n${pass} flow-routing checks passed.`);
