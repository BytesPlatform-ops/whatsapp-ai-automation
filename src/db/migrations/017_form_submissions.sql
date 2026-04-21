-- Form submissions — leads captured from contact forms on generated sites.
-- Replaces the Netlify Forms black-hole: the old flow silently caught leads
-- in Netlify's dashboard and nobody was notified. Now every submission hits
-- this table and fires a SendGrid email to the site owner (+ optional
-- WhatsApp notification in a later phase).

CREATE TABLE IF NOT EXISTS form_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID REFERENCES generated_sites(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  form_name VARCHAR(64),               -- e.g. 'quote', 'consultation', 'contact'
  name TEXT,
  email TEXT,
  phone TEXT,
  message TEXT,
  source_page TEXT,                    -- which page the form was submitted from
  ip_address INET,
  user_agent TEXT,
  delivery_status VARCHAR(32) DEFAULT 'pending',  -- pending, sent, failed, spam
  delivery_error TEXT,
  metadata JSONB DEFAULT '{}',
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_site_id ON form_submissions(site_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_user_id ON form_submissions(user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_status ON form_submissions(delivery_status) WHERE delivery_status IN ('pending', 'failed');
