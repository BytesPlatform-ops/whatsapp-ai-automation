-- Payment discount + domain-split tracking.
-- Supports the new website+domain combined flow: Stripe link amount =
-- website_amount + domain_amount. At 22h unpaid, a discount is applied
-- to website_amount only (domain price is fixed by Namecheap and can't
-- be discounted). original_amount preserves pre-discount total for
-- reporting and refund logic.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS website_amount INTEGER,       -- cents, pre-discount
  ADD COLUMN IF NOT EXISTS domain_amount INTEGER DEFAULT 0, -- cents, never discounted
  ADD COLUMN IF NOT EXISTS original_amount INTEGER,      -- cents, before any discount
  ADD COLUMN IF NOT EXISTS discount_applied BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS discount_pct INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selected_domain VARCHAR(253); -- 253 = max DNS length

CREATE INDEX IF NOT EXISTS idx_payments_discount_pending
  ON payments(status, discount_applied, created_at)
  WHERE status = 'pending' AND discount_applied = FALSE;
