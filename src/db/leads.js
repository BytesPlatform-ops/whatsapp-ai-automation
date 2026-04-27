// DB helpers for form_submissions — lead capture from generated sites.

const { supabase } = require('../config/database');
const { logger } = require('../utils/logger');

/**
 * Save a fresh form submission. Returns the created row (with id).
 */
async function createLead(fields) {
  const { data, error } = await supabase
    .from('form_submissions')
    .insert({
      site_id: fields.siteId || null,
      user_id: fields.userId || null,
      form_name: fields.formName || 'contact',
      name: fields.name || null,
      email: fields.email || null,
      phone: fields.phone || null,
      message: fields.message || null,
      source_page: fields.sourcePage || null,
      ip_address: fields.ipAddress || null,
      user_agent: fields.userAgent || null,
      delivery_status: 'pending',
      metadata: fields.metadata || {},
      // GDPR audit trail — server validates the checkbox came back true
      // before calling here, so consent_given will always be true on
      // newly-created rows. Stored explicitly so the row is self-evident
      // for a future audit / DSAR without joining other tables.
      consent_given: !!fields.consentGiven,
      consent_at: fields.consentAt || (fields.consentGiven ? new Date().toISOString() : null),
    })
    .select()
    .single();
  if (error) throw new Error(`createLead failed: ${error.message}`);
  return data;
}

/**
 * Mark a lead's delivery status after the email attempt. Non-fatal — a
 * failure to record status just means the admin dashboard shows 'pending'
 * instead of the true state.
 */
async function markLeadDelivery(leadId, status, error = null) {
  try {
    await supabase
      .from('form_submissions')
      .update({
        delivery_status: status,
        delivery_error: error || null,
      })
      .eq('id', leadId);
  } catch (err) {
    logger.warn(`[LEADS] markLeadDelivery(${leadId}) failed: ${err.message}`);
  }
}

/**
 * Look up the owner's user row for a given site. Used by the endpoint to
 * decide where to email the lead. Returns null if the site isn't linked to
 * a user (old/orphaned).
 */
async function getSiteOwnerInfo(siteId) {
  const { data, error } = await supabase
    .from('generated_sites')
    .select('id, user_id, site_data, preview_url')
    .eq('id', siteId)
    .maybeSingle();
  if (error || !data) return null;
  let email = null;
  let phone = null;
  let businessName = null;
  if (data.user_id) {
    const { data: user } = await supabase
      .from('users')
      .select('phone_number, channel, metadata')
      .eq('id', data.user_id)
      .maybeSingle();
    if (user) {
      email = user.metadata?.email || null;
      phone = user.phone_number || null;
      businessName = user.metadata?.websiteData?.businessName || null;
    }
  }
  // Fallback to site_data fields if user metadata is thin.
  if (!email) email = data.site_data?.contactEmail || null;
  if (!businessName) businessName = data.site_data?.businessName || null;
  return {
    siteId: data.id,
    userId: data.user_id,
    ownerEmail: email,
    ownerPhone: phone,
    businessName,
    previewUrl: data.preview_url,
  };
}

/**
 * Count recent submissions from an IP+site combo — drives the rate-limit
 * check. Any window beyond 60 min is overkill; 1 hour is conventional for
 * public form endpoints.
 */
async function countRecentLeadsFromIp(ipAddress, siteId, withinHours = 1) {
  const since = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('form_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('site_id', siteId)
    .eq('ip_address', ipAddress)
    .gte('submitted_at', since);
  if (error) {
    logger.warn(`[LEADS] countRecentLeadsFromIp failed: ${error.message}`);
    return 0;
  }
  return count || 0;
}

module.exports = {
  createLead,
  markLeadDelivery,
  getSiteOwnerInfo,
  countRecentLeadsFromIp,
};
