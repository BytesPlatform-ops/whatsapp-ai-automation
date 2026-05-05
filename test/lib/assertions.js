// Assertion matchers for fixture-based replay tests.
//
// LLMs are non-deterministic so most reply assertions are SOFT
// (substring matches, set-membership). State and metadata, which we
// fully control, can use STRICT equality. The matcher names below
// reflect that distinction:
//
//   state:                strict equals
//   state_one_of:         set membership (any of a list)
//   state_not:            strict not-equals
//   state_not_one_of:     set non-membership
//   metadata.<dot.path>:  strict equals
//   reply_contains:       substring (string OR array of strings — all required)
//   reply_not_contains:   substring negation (string OR array of strings)
//   sent_count_gte:       at least N captured outbound sends this turn
//
// Throws AssertionError on any miss. Test runner catches and reports.

class AssertionError extends Error {}

function getDeep(obj, dotPath) {
  if (!obj) return undefined;
  return dotPath.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

function jsonish(v) {
  try { return JSON.stringify(v); } catch (_) { return String(v); }
}

function eq(a, b) {
  // Loose-ish: stringify both sides so {x:1} === {x:1} is true. Cheap
  // and adequate for the simple primitives + small-object metadata
  // assertions that fixtures use.
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a !== 'object' && typeof b !== 'object') return String(a) === String(b);
  return jsonish(a) === jsonish(b);
}

function runExpectations(expect, user, captured, replyText) {
  const errors = [];

  if (!expect || typeof expect !== 'object') return errors;

  // ── State (current state after this turn) ────────────────────────
  if ('state' in expect) {
    if (user.state !== expect.state) {
      errors.push(`state: expected "${expect.state}", got "${user.state}"`);
    }
  }
  if (Array.isArray(expect.state_one_of)) {
    if (!expect.state_one_of.includes(user.state)) {
      errors.push(`state_one_of: expected one of [${expect.state_one_of.join(', ')}], got "${user.state}"`);
    }
  }
  if ('state_not' in expect) {
    if (user.state === expect.state_not) {
      errors.push(`state_not: state is "${user.state}" but should not equal "${expect.state_not}"`);
    }
  }
  if (Array.isArray(expect.state_not_one_of)) {
    if (expect.state_not_one_of.includes(user.state)) {
      errors.push(`state_not_one_of: state "${user.state}" is in forbidden set [${expect.state_not_one_of.join(', ')}]`);
    }
  }

  // ── Metadata (dot-path strict equals) ────────────────────────────
  // Any key in expect that starts with "metadata." is treated as a
  // path into user.metadata. Non-equality is reported with both sides
  // jsonified for readability.
  for (const key of Object.keys(expect)) {
    if (!key.startsWith('metadata.')) continue;
    const path = key.slice('metadata.'.length);
    const actual = getDeep(user.metadata || {}, path);
    const wanted = expect[key];
    if (wanted === '*exists*') {
      if (actual == null) errors.push(`${key}: expected to exist, got ${jsonish(actual)}`);
    } else if (wanted === '*missing*') {
      if (actual != null) errors.push(`${key}: expected to be missing, got ${jsonish(actual)}`);
    } else if (!eq(actual, wanted)) {
      errors.push(`${key}: expected ${jsonish(wanted)}, got ${jsonish(actual)}`);
    }
  }

  // ── Reply assertions ─────────────────────────────────────────────
  const replies = String(replyText || '');
  const arrify = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

  for (const needle of arrify(expect.reply_contains)) {
    if (!replies.toLowerCase().includes(String(needle).toLowerCase())) {
      errors.push(`reply_contains: did not find "${needle}" in replies\n  replies: ${replies.slice(0, 300)}`);
    }
  }
  for (const needle of arrify(expect.reply_not_contains)) {
    if (replies.toLowerCase().includes(String(needle).toLowerCase())) {
      errors.push(`reply_not_contains: found forbidden "${needle}" in replies`);
    }
  }

  // ── Send-count sanity (optional) ─────────────────────────────────
  if (typeof expect.sent_count_gte === 'number') {
    if (captured.length < expect.sent_count_gte) {
      errors.push(`sent_count_gte: captured ${captured.length} sends, expected >= ${expect.sent_count_gte}`);
    }
  }
  if (typeof expect.sent_count_lte === 'number') {
    if (captured.length > expect.sent_count_lte) {
      errors.push(`sent_count_lte: captured ${captured.length} sends, expected <= ${expect.sent_count_lte}`);
    }
  }

  return errors;
}

module.exports = {
  runExpectations,
  AssertionError,
};
