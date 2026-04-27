-- GDPR consent tracking on visitor-submitted forms.
--
-- Generated sites collect personal data (name, email, phone, message,
-- in salon's case appointment time). To make the SMB owner GDPR-
-- compliant we now require an explicit "I agree to the Privacy Policy"
-- checkbox at the form level AND record the consent decision on every
-- row so the owner has an audit trail.
--
-- Backfill: existing rows are marked consent_given=true with
-- consent_at = submitted_at / created_at. They were submitted under
-- the prior implicit-consent assumption — flipping them to false would
-- misrepresent history. New rows are required to set the flag.
--
-- Going forward the columns are NOT NULL on the application layer
-- (server rejects submissions without consent); we keep the DB
-- defaults loose so a backend bug doesn't lose a real lead, just
-- flags it for review in the admin panel.

ALTER TABLE form_submissions
  ADD COLUMN IF NOT EXISTS consent_given BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;

UPDATE form_submissions
   SET consent_given = TRUE, consent_at = submitted_at
 WHERE consent_given IS NULL OR consent_given = FALSE;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS consent_given BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;

UPDATE appointments
   SET consent_given = TRUE, consent_at = created_at
 WHERE consent_given IS NULL OR consent_given = FALSE;
