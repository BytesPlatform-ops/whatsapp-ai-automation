/**
 * Retry NameSilo DNS + Netlify attach for an already-purchased domain.
 *
 * One-shot recovery for customers whose original post-payment flow failed
 * partway through (e.g. the old TTL=300 NameSilo bug). Does the same work
 * postPayment.js would have done on a clean run:
 *   1. setDNSForNetlify (idempotent — cleans parking records, adds ours)
 *   2. addCustomDomainToNetlify (apex + www aliases)
 *   3. flip the site row to domain_setup_complete
 *
 * Usage:
 *   node src/scripts/retryNamesiloDNS.js <domain>
 *
 * Example:
 *   node src/scripts/retryNamesiloDNS.js pixiebytes.shop
 */

require('dotenv').config();

const axios = require('axios');
const { supabase } = require('../config/database');
const { setDNSForNetlify } = require('../integrations/namesilo');
const { addCustomDomainToNetlify } = require('../website-gen/deployer');
const { updateSite } = require('../db/sites');

const NETLIFY_API = 'https://api.netlify.com/api/v1';

/**
 * Verify the stored Netlify site_id still resolves. If it 404s but a site
 * with the same `name` (subdomain) exists, return that site's current ID
 * so the caller can correct the DB and continue.
 */
async function resolveNetlifySiteId(storedSiteId, subdomain) {
  const headers = { Authorization: `Bearer ${process.env.NETLIFY_TOKEN}` };

  // 1. Try the stored ID first.
  if (storedSiteId) {
    try {
      const r = await axios.get(`${NETLIFY_API}/sites/${storedSiteId}`, { headers });
      console.log(`  Netlify GET /sites/${storedSiteId} → 200 (name=${r.data.name})`);
      return { siteId: storedSiteId, corrected: false };
    } catch (err) {
      const status = err.response?.status;
      console.warn(`  Netlify GET /sites/${storedSiteId} → ${status || err.code}; falling back to name lookup.`);
    }
  }

  // 2. Fallback: find a site by its subdomain name.
  if (!subdomain) {
    throw new Error('Stored site_id 404s and no subdomain available for name-based fallback.');
  }
  const r = await axios.get(`${NETLIFY_API}/sites`, { headers, params: { name: subdomain } });
  const match = (r.data || []).find((s) => s.name === subdomain);
  if (!match) {
    throw new Error(
      `Netlify site is gone: stored id=${storedSiteId} returns 404 and no site found with name="${subdomain}". The site likely needs to be redeployed.`
    );
  }
  console.log(`  Found site by name: id=${match.id} (was stored as ${storedSiteId}). DB will be corrected.`);
  return { siteId: match.id, corrected: true };
}

const [, , rawDomain] = process.argv;

async function run() {
  if (!rawDomain) {
    console.error('Usage: node src/scripts/retryNamesiloDNS.js <domain>');
    process.exit(1);
  }
  if (!process.env.NAMESILO_API_KEY) {
    console.error('Missing NAMESILO_API_KEY in .env');
    process.exit(1);
  }

  const domain = rawDomain.toLowerCase().trim();
  console.log(`Looking up site for custom_domain="${domain}"...`);

  const { data, error } = await supabase
    .from('generated_sites')
    .select('id, user_id, netlify_site_id, netlify_subdomain, custom_domain, status, created_at')
    .eq('custom_domain', domain)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error(`Supabase lookup failed: ${error.message}`);
    process.exit(1);
  }
  if (!data || data.length === 0) {
    console.error(`No generated_sites row found with custom_domain="${domain}".`);
    process.exit(1);
  }

  const site = data[0];
  console.log('Found site:');
  console.log(`  site id:           ${site.id}`);
  console.log(`  user id:           ${site.user_id}`);
  console.log(`  netlify site id:   ${site.netlify_site_id}`);
  console.log(`  netlify subdomain: ${site.netlify_subdomain}`);
  console.log(`  status:            ${site.status}`);
  console.log(`  created at:        ${site.created_at}`);

  if (!site.netlify_subdomain) {
    console.error('Site row has no netlify_subdomain — cannot configure DNS.');
    process.exit(1);
  }

  console.log(`\nStep 1/3 — setDNSForNetlify("${domain}", "${site.netlify_subdomain}")...`);
  await setDNSForNetlify(domain, site.netlify_subdomain);

  if (!site.netlify_site_id && !site.netlify_subdomain) {
    console.warn('\nSite row has no netlify_site_id or netlify_subdomain — skipping Netlify attach. DNS is set but Netlify will not serve this domain.');
    return;
  }

  console.log(`\nStep 2/3 — verifying Netlify site exists, then attaching "${domain}" + www...`);
  let netlifySiteId;
  try {
    const resolved = await resolveNetlifySiteId(site.netlify_site_id, site.netlify_subdomain);
    netlifySiteId = resolved.siteId;
    if (resolved.corrected) {
      await updateSite(site.id, { netlify_site_id: netlifySiteId });
      console.log(`  Updated generated_sites.netlify_site_id → ${netlifySiteId}`);
    }
  } catch (err) {
    console.error(`\nCannot resolve Netlify site: ${err.message}`);
    console.error('DNS is configured, but the customer\'s site needs to be redeployed before Netlify will serve it.');
    process.exit(1);
  }

  await addCustomDomainToNetlify(netlifySiteId, domain);
  try {
    await addCustomDomainToNetlify(netlifySiteId, `www.${domain}`);
  } catch (err) {
    console.warn(`  www attach failed: ${err.message} — apex alone is enough, continuing.`);
  }

  console.log(`\nStep 3/4 — updating site row status to domain_setup_complete...`);
  await updateSite(site.id, { custom_domain: domain, status: 'domain_setup_complete' });

  console.log(`\nStep 4/4 — triggering Netlify SSL provisioning...`);
  try {
    const headers = { Authorization: `Bearer ${process.env.NETLIFY_TOKEN}` };
    await axios.post(`${NETLIFY_API}/sites/${netlifySiteId}/ssl`, null, { headers });
    console.log('  SSL provisioning kicked off — Let\'s Encrypt cert should be ready in a few minutes.');
  } catch (err) {
    const status = err.response?.status;
    if (status === 422) {
      console.log('  SSL not ready yet (Netlify 422 — DNS hasn\'t propagated). Re-run this script in 30 minutes to retry SSL.');
    } else {
      console.warn(`  SSL trigger failed: ${err.message}. You can re-run later.`);
    }
  }

  console.log('\nDone. DNS propagation can take 15 minutes to a few hours; SSL kicks in once DNS resolves.');
}

run().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
