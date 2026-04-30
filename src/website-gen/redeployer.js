// Redeployer — fast re-render path that skips LLM content generation.
// Used when we need to flip the activation banner on/off (after payment
// success, refund reversion, or a manual admin toggle). Reuses the last
// successful siteConfig from the DB so no Unsplash, no LLM, no regen of
// copy — just re-render templates with new flags and push to Netlify.

const { supabase } = require('../config/database');
const { logger } = require('../utils/logger');
const { deployToNetlify } = require('./deployer');
const { updateSite } = require('../db/sites');

/**
 * Redeploy a site with paymentStatus='paid'. Removes the activation banner
 * and unlocks contact forms. Idempotent — safe to call even if already paid.
 *
 * @param {number|string} siteId  Row ID in generated_sites
 * @returns {Promise<{ok: boolean, previewUrl?: string, reason?: string}>}
 */
async function redeployAsPaid(siteId) {
  if (!siteId) return { ok: false, reason: 'no siteId' };
  return redeployWithOverrides(siteId, { paymentStatus: 'paid', paymentLinkUrl: null });
}

/**
 * Redeploy a site back into preview mode (banner reappears). Used for
 * refund reversion or admin-initiated re-gating.
 */
async function redeployAsPreview(siteId, paymentLinkUrl = null) {
  if (!siteId) return { ok: false, reason: 'no siteId' };
  return redeployWithOverrides(siteId, { paymentStatus: 'preview', paymentLinkUrl });
}

/**
 * Internal — load stored siteConfig, apply overrides, re-render + redeploy.
 */
async function redeployWithOverrides(siteId, overrides) {
  const { data: site, error } = await supabase
    .from('generated_sites')
    .select('id, site_data, netlify_site_id, template_id')
    .eq('id', siteId)
    .single();

  if (error || !site) {
    logger.warn(`[REDEPLOY] Could not load site ${siteId}: ${error?.message || 'not found'}`);
    return { ok: false, reason: 'site not found' };
  }
  if (!site.site_data) {
    logger.warn(`[REDEPLOY] Site ${siteId} has no site_data to redeploy`);
    return { ok: false, reason: 'no site_data' };
  }
  if (!site.netlify_site_id) {
    logger.warn(`[REDEPLOY] Site ${siteId} has no netlify_site_id — cannot preserve URL`);
    return { ok: false, reason: 'no netlify_site_id' };
  }

  const newConfig = { ...site.site_data, ...overrides };

  try {
    const { previewUrl } = await deployToNetlify(newConfig, site.netlify_site_id);
    await updateSite(site.id, { site_data: newConfig, preview_url: previewUrl });
    logger.info(`[REDEPLOY] Site ${siteId} redeployed with paymentStatus=${overrides.paymentStatus} → ${previewUrl}`);
    return { ok: true, previewUrl };
  } catch (err) {
    logger.error(`[REDEPLOY] Site ${siteId} redeploy failed: ${err.message}`);
    return { ok: false, reason: err.message };
  }
}

/**
 * Sync a user's latest site's activation-banner URL to a new Stripe link.
 * Called every time createPaymentLink() runs so the site banner always
 * points to the same URL the user sees in WhatsApp chat. No-op when the
 * site is already paid or the URL hasn't changed.
 *
 * When the payment amount has also changed (e.g. the user picked a
 * different-priced domain after the preview was built), pass `opts.amount`
 * so the banner's activation total re-renders to match the chat. Without
 * this, the banner button clicks through to the correct Stripe checkout
 * but DISPLAYS the old total, which looks like a bug to the user.
 *
 * Fire-and-forget — callers log and continue if this fails.
 *
 * @param {string|number} userId
 * @param {string} newUrl            new Stripe payment link URL
 * @param {object} [opts]
 * @param {number} [opts.amount]     new activation total (website + domain)
 *                                   — when omitted, amount is left as-is
 */
async function updateSiteBannerLink(userId, newUrl, opts = {}) {
  if (!userId || !newUrl) return { ok: false, reason: 'missing args' };
  const { data: site, error } = await supabase
    .from('generated_sites')
    .select('id, site_data')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !site) return { ok: false, reason: 'no site' };
  const current = site.site_data || {};
  if (current.paymentStatus === 'paid') {
    logger.info(`[REDEPLOY] Skipping banner sync for site ${site.id} — already paid`);
    return { ok: true, reason: 'already paid' };
  }
  const amountChanged =
    opts.amount != null && Number.isFinite(Number(opts.amount)) && Number(opts.amount) !== current.activationAmount;
  const urlChanged = current.paymentLinkUrl !== newUrl;
  if (!amountChanged && !urlChanged) {
    return { ok: true, reason: 'already up to date' };
  }
  const overrides = { paymentLinkUrl: newUrl, paymentStatus: 'preview' };
  if (amountChanged) {
    overrides.activationAmount = Number(opts.amount);
    // Reset originalAmount to the same value so a new payment link does
    // NOT inadvertently render a stale strikethrough "was $X" badge.
    // The discount scheduler explicitly sets originalAmount+discountPct
    // when it re-runs, so that path is unaffected.
    overrides.originalAmount = Number(opts.amount);
    overrides.discountPct = 0;
  }
  logger.info(
    `[REDEPLOY] Syncing site ${site.id} banner → ${newUrl}` +
      (amountChanged ? ` (amount $${current.activationAmount} → $${opts.amount})` : '')
  );
  return redeployWithOverrides(site.id, overrides);
}

/**
 * Update banner pricing for a user's latest site — used when the 22h
 * discount job applies 20% off. Writes new activationAmount + originalAmount
 * + discountPct into the stored siteConfig so the banner renders the
 * strikethrough price and discount badge. Also swaps paymentLinkUrl to
 * the new Stripe link.
 *
 * Fire-and-forget. No-op on already-paid sites.
 */
async function updateSiteBannerPricing(userId, pricing = {}) {
  if (!userId) return { ok: false, reason: 'missing userId' };
  const { data: site, error } = await supabase
    .from('generated_sites')
    .select('id, site_data')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !site) return { ok: false, reason: 'no site' };
  const current = site.site_data || {};
  if (current.paymentStatus === 'paid') {
    logger.info(`[REDEPLOY] Skipping banner pricing update for site ${site.id} — already paid`);
    return { ok: true, reason: 'already paid' };
  }
  const overrides = { paymentStatus: 'preview' };
  if (pricing.paymentLinkUrl) overrides.paymentLinkUrl = pricing.paymentLinkUrl;
  if (pricing.activationAmount != null) overrides.activationAmount = pricing.activationAmount;
  if (pricing.originalAmount != null) overrides.originalAmount = pricing.originalAmount;
  if (pricing.discountPct != null) overrides.discountPct = pricing.discountPct;
  logger.info(
    `[REDEPLOY] Updating site ${site.id} banner pricing: ` +
      `$${pricing.activationAmount ?? '?'} ` +
      `(was $${pricing.originalAmount ?? '?'}, ${pricing.discountPct ?? 0}% off)`
  );
  return redeployWithOverrides(site.id, overrides);
}

/**
 * Redeploy a user's latest site with a new logo URL. Used when a user
 * uploads (or replaces) a logo AFTER the site is already live — we
 * splice the new logoUrl into the stored siteConfig and re-render +
 * push to Netlify so the favicon, nav, and footer update without
 * regenerating any LLM-generated copy.
 *
 * Targets the user's most-recent generated site.
 *
 * @param {string|number} userId
 * @param {string} logoUrl  Public URL of the processed logo
 * @returns {Promise<{ok: boolean, previewUrl?: string, reason?: string}>}
 */
async function redeployWithLogo(userId, logoUrl) {
  if (!userId || !logoUrl) return { ok: false, reason: 'missing args' };
  const { data: site, error } = await supabase
    .from('generated_sites')
    .select('id, site_data')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !site) {
    logger.warn(`[REDEPLOY] No site found for user ${userId} to apply logo`);
    return { ok: false, reason: 'no site' };
  }
  const current = site.site_data || {};
  if (current.logoUrl === logoUrl) {
    return { ok: true, reason: 'logo unchanged', previewUrl: null };
  }
  logger.info(`[REDEPLOY] Applying new logo to site ${site.id} → ${logoUrl}`);
  return redeployWithOverrides(site.id, { logoUrl });
}

module.exports = {
  redeployAsPaid,
  redeployAsPreview,
  redeployWithLogo,
  updateSiteBannerLink,
  updateSiteBannerPricing,
};
