// Handler smoke check — runs at server boot.
//
// Catches two classes of bugs before the server starts accepting traffic:
//
//   1. Parse / top-level errors: each handler file is `require()`d once.
//      Syntax errors, bad relative paths, and load-time circular-dep
//      issues all surface here.
//
//   2. Missing imports of known module functions: we statically scan each
//      handler for calls to sender / db functions (sendCTAButton, etc.)
//      and verify those names are destructured from a require at the top
//      of the file. This is what would have caught the sendCTAButton
//      bug where serviceSelection.js called the function but never
//      imported it — the call was inside a `switch` branch, so require()
//      of the file didn't crash, but the code path crashed the first
//      time a user hit it.
//
// The check is intentionally narrow. It does NOT attempt full static
// analysis of the codebase — that's what ESLint is for. It targets the
// one bug pattern we just got bitten by, cheaply.

const fs = require('fs');
const path = require('path');

// Names that handlers commonly destructure from require('...'). If a
// handler calls one of these but doesn't have it in a require, it's a
// missing-import bug. Expand this list when we add new commonly-used
// module exports that handlers should destructure explicitly.
const KNOWN_EXPORTS = {
  '../../messages/sender': [
    'sendTextMessage',
    'sendInteractiveButtons',
    'sendInteractiveList',
    'sendWithMenuButton',
    'sendCTAButton',
    'sendDocument',
    'sendDocumentBuffer',
    'sendImage',
    'markAsRead',
    'downloadMedia',
    'showTyping',
    'setLastMessageId',
  ],
  '../../db/conversations': ['logMessage', 'getConversationHistory', 'clearHistory'],
  '../../db/users': ['findOrCreateUser', 'updateUserState', 'updateUserMetadata', 'updateUser'],
};
const ALL_KNOWN_NAMES = new Set(
  Object.values(KNOWN_EXPORTS).flat()
);

// JS keywords that the call-detection regex would otherwise treat as
// function names. Skip these to avoid false positives on "if (", "for (",
// "switch (", etc.
const JS_KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default',
  'break', 'continue', 'return', 'throw', 'try', 'catch', 'finally',
  'new', 'typeof', 'instanceof', 'in', 'of', 'void', 'delete', 'yield',
  'await', 'async', 'function', 'class', 'const', 'let', 'var',
  'import', 'export', 'this', 'super', 'null', 'undefined', 'true', 'false',
]);

/**
 * Extract names destructured from any `const { a, b, c } = require(...)`
 * at the top of the source. Handles multi-line destructures and
 * rename-aliases like `{ foo: bar }`.
 */
function extractImportedNames(src) {
  const names = new Set();
  const re = /const\s*\{\s*([^}]+)\s*\}\s*=\s*require\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const body = m[1];
    for (const raw of body.split(',')) {
      // Handle aliases: `foo: bar` — imported name is the right side.
      const parts = raw.split(':').map((s) => s.trim());
      const name = (parts.length === 2 ? parts[1] : parts[0]).replace(/\s+/g, '');
      if (name) names.add(name);
    }
  }
  // Also catch non-destructured whole-module imports: `const x = require(...)`
  // Those names aren't callable as bare identifiers — they'd be used as
  // `x.foo()`, which our call-regex excludes via the negative lookbehind.
  // But mark them as locals so `x(` (if called as a function) isn't flagged.
  const modRe = /const\s+([a-zA-Z_$][\w$]*)\s*=\s*require\s*\(/g;
  while ((m = modRe.exec(src)) !== null) {
    names.add(m[1]);
  }
  return names;
}

/**
 * Extract names defined locally in the file — top-level functions, consts,
 * lets, and vars. These shouldn't be flagged as missing imports even if
 * they share a name with a known module export.
 */
function extractLocalNames(src) {
  const names = new Set();
  const re = /(?:^|[;\n])\s*(?:async\s+)?(?:function\s+|const\s+|let\s+|var\s+)([a-zA-Z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    names.add(m[1]);
  }
  return names;
}

/**
 * Find every identifier that's being called as a function — `foo(`.
 * Negative lookbehind on `\w` or `.` excludes method calls (`obj.foo(`)
 * and already-prefixed identifiers.
 */
function extractCallNames(src) {
  const names = new Set();
  const re = /(?<![\w.])([a-zA-Z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (!JS_KEYWORDS.has(m[1])) names.add(m[1]);
  }
  return names;
}

/**
 * Analyze one handler file for missing imports among the known function
 * names. Returns an array of missing names (empty = clean).
 */
function analyzeFile(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const imported = extractImportedNames(src);
  const locals = extractLocalNames(src);
  const calls = extractCallNames(src);
  const missing = [];
  for (const name of calls) {
    if (!ALL_KNOWN_NAMES.has(name)) continue;   // not one of the watched functions
    if (imported.has(name)) continue;            // destructured somewhere
    if (locals.has(name)) continue;              // shadowed by local definition
    missing.push(name);
  }
  return missing;
}

/**
 * Run the smoke check. Returns `{ ok, errors }`. The caller decides
 * whether to exit on failure — keeping that decision at the call site
 * lets tests invoke this without killing the process.
 */
function runHandlerSmokeCheck() {
  const errors = [];
  const handlersDir = path.join(__dirname, '..', 'conversation', 'handlers');
  let files = [];
  try {
    files = fs.readdirSync(handlersDir).filter((f) => f.endsWith('.js'));
  } catch (err) {
    errors.push(`Could not read handlers dir: ${err.message}`);
    return { ok: false, errors };
  }
  for (const file of files) {
    const filePath = path.join(handlersDir, file);
    // 1. require() it — catches parse errors and top-level throws.
    try {
      // Clear require cache for this one file so the check is honest
      // even when the server has already loaded it somewhere else.
      delete require.cache[require.resolve(filePath)];
      require(filePath);
    } catch (err) {
      errors.push(`[HANDLER] ${file}: require() failed — ${err.message}`);
      continue;
    }
    // 2. Scan for missing imports of known functions.
    try {
      const missing = analyzeFile(filePath);
      for (const name of missing) {
        errors.push(`[HANDLER] ${file}: calls ${name}() but it's not destructured from any require()`);
      }
    } catch (err) {
      errors.push(`[HANDLER] ${file}: static analysis failed — ${err.message}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

module.exports = { runHandlerSmokeCheck };
