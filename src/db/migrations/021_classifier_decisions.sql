-- Phase 1: Classifier-decision observability table.
--
-- Goal: every LLM-driven classifier in the router pipeline records its
-- decision per turn so a tester-bug report can be diagnosed in seconds
-- instead of grep-spelunking server logs. Multiple classifiers fire in
-- parallel + serial per turn (undo, intent, correctionDetector, side-
-- channel, salesBot speech/topic, etc.) — each row here is ONE
-- classifier's verdict for ONE turn.
--
-- Read pattern: admin dashboard groups by (user_id, turn_id) to render
-- a per-turn "🔍 Trace" panel inline with the conversation. Write
-- pattern: fire-and-forget INSERT from inside each classifier wrapper.
-- We never block a classifier on this insert — observability MUST NOT
-- be on the critical path.

CREATE TABLE IF NOT EXISTS classifier_decisions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- turn_id groups all decisions made in response to a single inbound
  -- message. Generated at the top of router.handleIncomingMessage and
  -- propagated via channelContext (AsyncLocalStorage). Same turn_id
  -- across all classifier rows for that turn.
  turn_id      UUID NOT NULL,
  -- The classifier function/identifier (e.g. 'classifyUndoOrKeep',
  -- 'correctionDetector', 'classifyIntent', 'side_channel',
  -- 'sales_bot_speech', 'sales_conv_topic', 'sales_user_intent').
  classifier   TEXT NOT NULL,
  -- The user's text the classifier saw (or a short summary if the
  -- input was non-text). Truncated to 500 chars defensively.
  input_text   TEXT,
  -- Extra context the classifier had: current_state, undoPending,
  -- known fields, prior state, etc. Free-form JSON so we can add
  -- fields without a migration each time.
  input_context JSONB DEFAULT '{}'::jsonb,
  -- The classifier's output. Shape varies by classifier but ALWAYS
  -- structured (kind / intent / field / etc.). Free-form JSON for
  -- the same flexibility as input_context.
  output       JSONB DEFAULT '{}'::jsonb,
  latency_ms   INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary read path: fetch all decisions for a user, ordered by time,
-- grouped (in app code) by turn_id. The composite index covers it.
CREATE INDEX IF NOT EXISTS idx_classifier_decisions_user_created
  ON classifier_decisions (user_id, created_at DESC);

-- Secondary: when admin clicks a single turn's "Trace" panel we want
-- to filter to that turn cheaply.
CREATE INDEX IF NOT EXISTS idx_classifier_decisions_turn
  ON classifier_decisions (turn_id);

-- Optional cleanup: rows older than 30 days lose value (tester convos
-- are usually debugged within hours/days). A periodic VACUUM/DELETE
-- can be added later when volume warrants. For now, keep everything.
