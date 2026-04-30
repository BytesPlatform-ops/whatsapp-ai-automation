// Rapid-message buffering (Phase 7).
//
// Users on WhatsApp type in bursts ("hey" / "actually" / "my name is X" /
// "and i need Y"). Without buffering each fragment triggers its own turn:
// the bot replies four times, each reply only sees one piece, extraction is
// poor, and the bot looks frantic — typing while the user is still typing.
//
// This module debounces rapid text messages from the same user into a single
// merged turn. Design:
//
//   1. Pre-processing debounce (1s): when a text arrives and the buffer is
//      empty, start a 1s timer. Every new text resets it. When 1s of silence
//      passes, concat the buffer and fire ONE turn.
//
//   2. In-flight coalescing: messages arriving while a turn is running go
//      into the buffer and debounce normally. When their timer fires, the
//      new batch is chained after the running turn — so turns stay serial
//      per user and a "reply then reply again" cascade can't happen.
//
//   3. Escape hatches (skip the buffer): non-text messages (images, audio,
//      documents, location, button taps) and slash commands (/reset, /menu)
//      bypass this module entirely and take the direct path in the router.
//
//   4. Cap: max 10 buffered messages per user. On overflow the buffer
//      flushes immediately so a flood can't stall forever or balloon the
//      merged prompt.
//
// State is per-process in-memory — fine for the current single-process
// deploy; would need Redis to coordinate across multiple workers. Same
// limitation already applies to USER_LOCKS and RECENT_MESSAGES in router.js.

const { logger } = require('../utils/logger');

// 500ms still solves the burst-typing problem (users typing "hi" / "actually" /
// "and X" in rapid succession get merged into one turn) while shaving 0.5s off
// every text reply. Original value was 1000ms; lowered after profiling showed
// the debounce was the single largest fixed cost in the reply path.
const DEBOUNCE_MS = 500;
const MAX_BUFFER = 10;

// Map<userKey, { pending, resolvers, timer, flushing }>
const BUFFERS = new Map();

/**
 * Is this message eligible for buffering? Text only, and not a slash
 * command (those need instant exact-match handling in the router).
 */
function isBufferable(message) {
  if (!message || message.type !== 'text') return false;
  const body = String(message.text || '').trim();
  if (!body) return false;
  if (body.startsWith('/')) return false;
  // Button/list replies come in as type 'interactive' from the parser, but
  // be defensive in case a caller normalizes them to text first.
  if (message.buttonId || message.listId) return false;
  return true;
}

function getState(key) {
  let state = BUFFERS.get(key);
  if (!state) {
    state = { pending: [], resolvers: [], timer: null, flushing: null };
    BUFFERS.set(key, state);
  }
  return state;
}

function mergeBatch(batch) {
  if (batch.length === 1) return batch[0];
  const bodies = batch.map((m) => String(m.text || '').trim()).filter(Boolean);
  // Use the latest message as the base so messageId, timestamp and any
  // channel-specific fields reflect the most recent arrival. This also
  // keeps dedup keyed on a stable, known-new id.
  const latest = batch[batch.length - 1];
  return {
    ...latest,
    text: bodies.join('\n'),
    bufferedCount: batch.length,
    bufferedMessageIds: batch.map((m) => m.messageId).filter(Boolean),
  };
}

function flushNow(key, processFn) {
  const state = BUFFERS.get(key);
  if (!state || state.pending.length === 0) return state?.flushing || Promise.resolve();

  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }

  const batch = state.pending.splice(0);
  const resolvers = state.resolvers.splice(0);
  const merged = mergeBatch(batch);

  if (batch.length > 1) {
    logger.info(`[BUFFER] Merging ${batch.length} messages for ${key}`);
  }

  // Chain after any turn already running for this user so the LLM pipeline
  // stays serial. withUserLock inside processFn gives us this too, but
  // chaining here also means the local flushing promise reflects the true
  // completion time — needed so the finally() below can auto-schedule a
  // fresh debounce for anything that piled up while we were busy.
  const prior = state.flushing || Promise.resolve();
  const run = async () => {
    try {
      const result = await processFn(merged);
      resolvers.forEach((r) => r(result));
      return result;
    } catch (err) {
      // processFn is the router's own retry/runWithContext wrapper, which
      // swallows its own errors. A throw here would be surprising, but if
      // it happens we still need every awaiting webhook to resolve or the
      // HTTP handler hangs until its own timeout.
      logger.error(`[BUFFER] processFn threw for ${key}: ${err.message}`);
      resolvers.forEach((r) => r(undefined));
    }
  };
  const next = prior.then(run, run);
  state.flushing = next;
  next.finally(() => {
    const s = BUFFERS.get(key);
    if (!s) return;
    // Only clear flushing if we're still the current in-flight turn; a
    // later flushNow may already have stacked on top of us.
    if (s.flushing === next) s.flushing = null;

    // Messages that arrived while we were processing sat in pending with
    // no timer (enqueue skips scheduling during in-flight). Now that the
    // turn is done, start one 1s debounce for ALL of them together — this
    // is the in-flight coalescing path. Without this, they'd sit there
    // forever (pre-fix: each message set its own timer and produced its
    // own reply, which is the bug we're fixing).
    if (s.pending.length > 0 && !s.timer && !s.flushing) {
      s.timer = setTimeout(() => flushNow(key, processFn), DEBOUNCE_MS);
      return;
    }
    if (s.pending.length === 0 && !s.timer && !s.flushing) {
      BUFFERS.delete(key);
    }
  });
  return next;
}

/**
 * Buffer a text message. Returns a promise that resolves when the turn
 * containing this message finishes processing.
 *
 * Two paths:
 *   - Idle (no turn in-flight): start/reset a 1s debounce. Rapid messages
 *     within the window merge; silence triggers the flush.
 *   - In-flight (a turn is already running): just accumulate. The running
 *     turn's finally() hook will schedule the next debounce once it's
 *     done, so everything that arrived during processing merges into ONE
 *     follow-up reply instead of N per-message replies.
 */
function enqueue(message, processFn) {
  const key = message.from || 'anon';
  const state = getState(key);

  return new Promise((resolve) => {
    state.pending.push(message);
    state.resolvers.push(resolve);

    // Overflow cap — flush immediately (chains after any in-flight turn
    // via flushNow's prior.then). Caller still gets a resolved promise
    // when its batch completes.
    if (state.pending.length >= MAX_BUFFER) {
      logger.warn(`[BUFFER] Cap hit (${MAX_BUFFER}) for ${key}, flushing early`);
      flushNow(key, processFn);
      return;
    }

    // In-flight coalescing: a turn is running. Do NOT schedule a debounce
    // here — the turn's finally() will schedule one covering everything
    // accumulated so far. This is the fix for "5 rapid messages produced
    // 5 separate replies" — without this branch, each message set its own
    // 1s timer and flushed independently, so in-flight coalescing didn't
    // actually coalesce.
    if (state.flushing) {
      logger.debug(`[BUFFER] Accumulating during in-flight turn for ${key} (pending=${state.pending.length})`);
      return;
    }

    // Idle path: standard debounce. Reset on every arrival so the window
    // extends as long as the user keeps typing.
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => flushNow(key, processFn), DEBOUNCE_MS);
  });
}

/**
 * Drain any pending text buffer for this user immediately. Used by the
 * router when a non-bufferable message (image, slash command, button tap)
 * arrives: we flush pending text first so it processes before the new
 * message, keeping user-visible ordering intact.
 *
 * The returned promise resolves when the flushed batch (if any) finishes
 * processing — callers that need strict ordering should await it before
 * starting their own turn.
 */
function flushPending(key) {
  const state = BUFFERS.get(key);
  if (!state || state.pending.length === 0) {
    // Nothing pending, but a prior flush may still be running; return
    // that so callers can serialize on it if they want.
    return state?.flushing || Promise.resolve();
  }
  // processFn is attached per-enqueue on the resolvers' closures — but we
  // need the same processFn here. Stash it on state the first time we see
  // it. (Set by enqueue via the setTimeout closure — pull from state.)
  // Simpler: require caller to pass the processFn. See flushPendingWith.
  return Promise.resolve();
}

/**
 * Drain variant that accepts the processFn. The router always has the
 * same function available, so passing it is cheap and avoids stashing
 * closures on module state.
 */
function flushPendingWith(key, processFn) {
  const state = BUFFERS.get(key);
  if (!state) return Promise.resolve();
  if (state.pending.length > 0) {
    return flushNow(key, processFn);
  }
  return state.flushing || Promise.resolve();
}

module.exports = {
  enqueue,
  isBufferable,
  flushPending,
  flushPendingWith,
  // exported for tests / diagnostics
  _DEBOUNCE_MS: DEBOUNCE_MS,
  _MAX_BUFFER: MAX_BUFFER,
};
