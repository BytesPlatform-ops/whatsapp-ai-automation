-- 022 — allow role='system' in conversations.
--
-- The original 001_initial.sql constrained `role IN ('user', 'assistant')`,
-- but the admin dashboard's chat renderer (dashboard.html) explicitly
-- treats role='system' rows as visual dividers (e.g. `── session
-- restarted (/reset) ──`, `[HANDOFF] notified team about chatbot`). Both
-- the /reset sentinel in router.js AND the handoff marker in handoff.js
-- have been writing role='system' inserts that silently failed the
-- check constraint — the row never landed, the divider never rendered,
-- and the only signal was a one-line `logMessage failed: ...check
-- constraint conversations_role_check` warning in the server log.
--
-- This migration drops the old constraint and adds it back with
-- 'system' included so those existing call sites finally work.
-- Additive change — no row in the DB was ever 'system' (the constraint
-- prevented it), so there's nothing to migrate.

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_role_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_role_check
  CHECK (role IN ('user', 'assistant', 'system'));
