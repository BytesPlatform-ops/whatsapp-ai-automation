// Post-payment handler — runs the full "payment confirmed" flow:
//   1. Mark payment paid in DB (if not already)
//   2. Update user metadata + user state
//   3. Trigger redeployAsPaid() so the activation banner disappears
//   4. If domain selected: auto-purchase + attach via Namecheap + Netlify
//   5. Send WhatsApp confirmation to the correct phone number
//   6. Fire SendGrid notification to the team
//
// Idempotent: if the payment row is already 'paid' and has a paid_at
// timestamp, returns early (webhook retries + scheduler poll overlap
// won't cause double confirmations or double domain purchases).
//
// Called from:
//   - src/payments/stripeWebhook.js (on checkout.session.completed)
//   - src/followup/scheduler.js (fallback poller if webhook misses)

const { supabase } = require('../config/database');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { updateUserMetadata } = require('../db/users');
const { logMessage } = require('../db/conversations');
const { sendTextMessage } = require('../messages/sender');
const { runWithContext } = require('../messages/channelContext');

/**
 * Apply the post-payment flow for a confirmed Stripe session. Call this
 * once a payment is known to be paid (via webhook or poller). Safe to
 * call multiple times — the idempotency check short-circuits repeats.
 *
 * @param {object} payment       The payments row (id, user_id, phone_number, etc.)
 * @param {object} paidSession   A Stripe checkout session object with
 *                               customer_details and payment_intent.
 * @returns {Promise<{ok: boolean, skipped?: boolean, reason?: string}>}
 */
async function handleConfirmedPayment(payment, paidSession) {
  if (!payment?.id) return { ok: false, reason: 'missing payment' };
  if (!paidSession?.id) return { ok: false, reason: 'missing session' };

  // ── Idempotency — re-fetch current state to avoid races with other
  //   callers (scheduler + webhook both firing for the same payment).
  const { data: freshPayment } = await supabase
    .from('payments')
    .select('id, status, paid_at, user_id, phone_number, service_type, description, amount, stripe_payment_link_id')
    .eq('id', payment.id)
    .maybeSingle();
  if (!freshPayment) return { ok: false, reason: 'payment vanished' };
  if (freshPayment.status === 'paid' && freshPayment.paid_at) {
    logger.info(`[PAY] ${payment.id} already marked paid — skipping duplicate processing`);
    return { ok: true, skipped: true };
  }

  // Merge any fields the caller has over the DB row. Scheduler passes the
  // full row; webhook may only pass session + id.
  const p = { ...freshPayment, ...payment };

  // ── 1. Update payment row to paid
  await supabase.from('payments').update({
    status: 'paid',
    stripe_session_id: paidSession.id,
    stripe_payment_intent_id: paidSession.payment_intent || null,
    customer_email: paidSession.customer_details?.email || null,
    customer_name: paidSession.customer_details?.name || null,
    paid_at: new Date().toISOString(),
  }).eq('id', p.id);

  // Deactivate the Stripe payment link so the raw checkout URL (sitting in
  // WhatsApp messages, screenshots, bookmarks) can't be paid a second time.
  // The /pay/:id endpoint handles the friendly "already paid" UX for any
  // click that comes through the banner; this is defense in depth for the
  // raw Stripe URL path. Fire-and-forget — a failure here doesn't affect
  // the rest of the flow.
  if (freshPayment.stripe_payment_link_id && env.stripe?.secretKey) {
    (async () => {
      try {
        const Stripe = require('stripe');
        const s = new Stripe(env.stripe.secretKey);
        await s.paymentLinks.update(freshPayment.stripe_payment_link_id, { active: false });
        logger.info(`[PAY] Deactivated Stripe link ${freshPayment.stripe_payment_link_id} after successful payment ${p.id}`);
      } catch (err) {
        logger.warn(`[PAY] Could not deactivate Stripe link ${freshPayment.stripe_payment_link_id}: ${err.message}`);
      }
    })();
  }

  // ── 2. Resolve user + target phone/channel from USER ROW (not payment row)
  //   payment.phone_number can be stale across bot re-enrollment.
  const { data: paidUserRecord } = await supabase
    .from('users')
    .select('phone_number, channel, metadata, via_phone_number_id')
    .eq('id', p.user_id)
    .maybeSingle();
  const targetPhone = paidUserRecord?.phone_number || p.phone_number;
  const targetChannel = paidUserRecord?.channel || p.channel || 'whatsapp';
  const targetVia = paidUserRecord?.via_phone_number_id || null;
  if (paidUserRecord?.phone_number && p.phone_number && paidUserRecord.phone_number !== p.phone_number) {
    logger.warn(`[PAY] Phone mismatch for ${p.id}: payment=${p.phone_number}, user=${paidUserRecord.phone_number} — using user record`);
  }

  const amountDisplay = `$${(p.amount / 100).toLocaleString()}`;
  const isWebsitePayment = /website|web/i.test(p.service_type || '') || /website|web/i.test(p.description || '');

  if (isWebsitePayment) {
    const meta = paidUserRecord?.metadata || {};
    const selectedDomain = meta.selectedDomain;
    const { getLatestSite } = require('../db/sites');
    const { updateSite } = require('../db/sites');

    await updateUserMetadata(p.user_id, {
      paymentConfirmed: true,
      lastPaymentAmount: p.amount,
      lastPaymentService: p.service_type,
      paidAt: new Date().toISOString(),
    });

    // ── 3. Remove the activation banner (fire-and-forget — never block
    //   the downstream WhatsApp confirmation if the redeploy fails).
    try {
      const siteForBanner = await getLatestSite(p.user_id);
      if (siteForBanner?.id) {
        const { redeployAsPaid } = require('../website-gen/redeployer');
        redeployAsPaid(siteForBanner.id).catch((err) =>
          logger.warn(`[PAY] redeployAsPaid threw for site ${siteForBanner.id}: ${err.message}`)
        );
      }
    } catch (err) {
      logger.warn(`[PAY] Banner-removal trigger failed: ${err.message}`);
    }

    // ── 4. Domain flow (only when a domain was selected + still pending)
    if (selectedDomain && meta.domainPaymentPending) {
      await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, async () => {
        await sendTextMessage(
          targetPhone,
          `Payment of *${amountDisplay}* received! 🎉\n\n` +
          `Now setting up *${selectedDomain}* for your website — this usually takes a few minutes. I'll keep you updated!`
        );
      });
      await logMessage(p.user_id, `Payment confirmed: ${amountDisplay} — starting domain setup for ${selectedDomain}`, 'assistant');

      const site = await getLatestSite(p.user_id);
      const netlifySubdomain = site?.netlify_subdomain || '';
      const netlifySiteId = site?.netlify_site_id || '';

      if (env.namecheap?.apiKey) {
        try {
          const { purchaseAndConfigureDomain } = require('../integrations/namecheap');
          const { addCustomDomainToNetlify } = require('../website-gen/deployer');

          await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () =>
            sendTextMessage(targetPhone, `⏳ Registering *${selectedDomain}*...`)
          );

          const result = await purchaseAndConfigureDomain(selectedDomain, netlifySubdomain);
          if (result.success) {
            if (netlifySiteId) {
              await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () =>
                sendTextMessage(targetPhone, `⏳ Configuring your website on *${selectedDomain}*...`)
              );
              try { await addCustomDomainToNetlify(netlifySiteId, selectedDomain); } catch (e) {
                logger.error('[PAY] Netlify domain add failed:', e.message);
              }
            }
            if (site) await updateSite(site.id, { custom_domain: selectedDomain, status: 'domain_setup_complete' });
            await updateUserMetadata(p.user_id, {
              domainPaymentPending: false,
              domainStatus: 'purchased',
              domainPurchasedAt: new Date().toISOString(),
            });
            await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () =>
              sendTextMessage(
                targetPhone,
                `✅ *${selectedDomain}* is registered and configured!\n\n` +
                `DNS is propagating now — your site will be live at *${selectedDomain}* within 5-60 minutes. ` +
                `HTTPS is set up automatically.\n\n` +
                `I'll send you a message once it's fully live! 🚀`
              )
            );
            await logMessage(p.user_id, `Domain purchased and configured: ${selectedDomain}`, 'assistant');
          } else {
            if (site) await updateSite(site.id, { custom_domain: selectedDomain, status: 'domain_setup_pending' });
            await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () =>
              sendTextMessage(
                targetPhone,
                `Domain registration for *${selectedDomain}* needs manual setup (${result.error}). Our team will handle it within 2 business days — we'll keep you posted!`
              )
            );
            await logMessage(p.user_id, `Domain auto-purchase failed: ${result.error} — manual setup needed`, 'assistant');
          }
        } catch (err) {
          logger.error('[PAY] Domain auto-purchase error:', err.message);
          try {
            const site = await getLatestSite(p.user_id);
            if (site) await updateSite(site.id, { custom_domain: selectedDomain, status: 'domain_setup_pending' });
          } catch (_) { /* ignore */ }
          await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () =>
            sendTextMessage(targetPhone, `Domain setup for *${selectedDomain}* is being handled by our team. We'll update you within 2 business days!`)
          );
        }
      } else {
        // No Namecheap API — manual flow
        if (site) await updateSite(site.id, { custom_domain: selectedDomain, status: 'domain_setup_pending' });
        await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () =>
          sendTextMessage(
            targetPhone,
            `Payment received! Our team will set up *${selectedDomain}* for your website within 2 business days. We'll send you the live link once it's ready!`
          )
        );
      }
    } else {
      // Regular website payment (no domain selected) — offer domain next
      await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () => sendTextMessage(
        targetPhone,
        `Payment of *${amountDisplay}* received! Thank you for choosing Bytes Platform.\n\n` +
          `*Package:* ${p.description || p.service_type}\n\n` +
          `Your website is all set! Would you like to put it on your own custom domain?\n\n` +
          `Just say *"yes"* and I'll help you find one, or *"no"* if you're good for now.`
      ));
      await logMessage(p.user_id, `Payment confirmed: ${amountDisplay}`, 'assistant');
      const { updateUserState } = require('../db/users');
      await updateUserState(p.user_id, 'DOMAIN_OFFER');
    }
  } else {
    // Non-website payment
    await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () => sendTextMessage(
      targetPhone,
      `Payment of *${amountDisplay}* received! Thank you for choosing Bytes Platform.\n\n` +
        `*Package:* ${p.description || p.service_type}\n\n` +
        `Our team will be in touch shortly to kick things off. If you have any questions in the meantime, just message here.`
    ));
    await logMessage(p.user_id, `Payment confirmed: ${amountDisplay} for ${p.service_type}`, 'assistant');
    await updateUserMetadata(p.user_id, {
      paymentConfirmed: true,
      lastPaymentAmount: p.amount,
      lastPaymentService: p.service_type,
    });
  }

  // ── 6. Team email notification (best-effort — never fails the flow)
  try {
    const { sendPaymentNotification } = require('../notifications/email');
    const { getLatestSite } = require('../db/sites');
    const site = await getLatestSite(p.user_id);
    await sendPaymentNotification({
      userName: paidSession.customer_details?.name || targetPhone,
      userPhone: targetPhone,
      userEmail: paidSession.customer_details?.email || '',
      amount: p.amount / 100,
      serviceType: p.service_type,
      description: p.description,
      sitePreviewUrl: site?.preview_url || '',
      channel: targetChannel,
    });
  } catch (emailErr) {
    logger.error('[PAY] Email notification failed:', emailErr.message);
  }

  logger.info(`[PAY] Confirmed payment from ${targetPhone}: ${amountDisplay} for ${p.service_type}`);
  return { ok: true };
}

module.exports = { handleConfirmedPayment };
