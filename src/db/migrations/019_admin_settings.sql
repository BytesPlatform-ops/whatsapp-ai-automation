-- Admin-managed runtime settings (prices, feature flags, etc.).
--
-- Lets us change pricing from the admin panel without a redeploy. The
-- canonical source for any setting in this table is the row here; if
-- a row is missing, callers fall back to a hardcoded default (or an
-- env var, depending on the consumer). That way:
--   - fresh installs work with sensible defaults,
--   - admin can override at runtime,
--   - clearing a row reverts to the default.
--
-- key/value is JSONB so we can store numbers, strings, or small objects
-- without a per-setting column. The application layer enforces shapes.
--
-- Initial seeded keys (managed today):
--   website_price          — base activation price (USD), default 199
--   website_discount_pct   — auto 22h discount %, default 20
--   revision_price         — custom-work / 3rd-revision floor, default 200
--   seo_floor_price        — SEO/SMM floor tier, default 200

CREATE TABLE IF NOT EXISTS admin_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO admin_settings (key, value, description) VALUES
  ('website_price', '199', 'Base website activation price (USD)'),
  ('website_discount_pct', '20', 'Discount % auto-applied at 22h on the activation banner'),
  ('revision_price', '200', 'Custom-work / 3rd-revision floor price (USD)'),
  ('seo_floor_price', '200', 'SEO / SMM floor tier price (USD)')
ON CONFLICT (key) DO NOTHING;
