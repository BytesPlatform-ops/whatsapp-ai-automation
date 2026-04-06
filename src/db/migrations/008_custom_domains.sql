-- Add custom domain support to generated_sites
ALTER TABLE generated_sites ADD COLUMN IF NOT EXISTS netlify_site_id TEXT;
ALTER TABLE generated_sites ADD COLUMN IF NOT EXISTS netlify_subdomain TEXT;
ALTER TABLE generated_sites ADD COLUMN IF NOT EXISTS custom_domain TEXT;
