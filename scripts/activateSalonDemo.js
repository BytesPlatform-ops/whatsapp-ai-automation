#!/usr/bin/env node
/**
 * One-off: redeploy the Blush Bar salon demo with paymentStatus='paid'
 * so the activation banner is removed. Uses the existing Netlify site
 * id so the public URL (preview-1778539528740.netlify.app) stays the
 * same and landing/lib/demoSites.ts needs no update.
 */
require('dotenv').config();
const { generateWebsiteContent } = require('../src/website-gen/generator');
const { deployToNetlify } = require('../src/website-gen/deployer');
const salonDemo = require('./demos/salonDemo');

const SALON_NETLIFY_SITE_ID = 'd47b8bcf-4695-430d-9035-83e9a0891300';

(async () => {
  const { businessData, templateId } = salonDemo;
  console.log(`Regenerating ${businessData.businessName} as paid…`);
  const siteConfig = await generateWebsiteContent(businessData, {
    templateId,
    paymentStatus: 'paid',
  });
  const { previewUrl } = await deployToNetlify(siteConfig, SALON_NETLIFY_SITE_ID);
  console.log(`✔ Activated: ${previewUrl}`);
})().catch((e) => {
  console.error('Failed:', e.message);
  process.exit(1);
});
