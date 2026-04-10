const Stripe = require('stripe');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { createPayment, updatePayment, findPaymentBySessionId } = require('../db/payments');

let stripe = null;

function getStripe() {
  if (!stripe && env.stripe.secretKey) {
    stripe = new Stripe(env.stripe.secretKey);
  }
  return stripe;
}

/**
 * Create a Stripe Payment Link for a specific service/package.
 * Returns the payment link URL and stores the payment record in DB.
 */
async function createPaymentLink({ userId, phoneNumber, amount, serviceType, packageTier, description, customerEmail, customerName }) {
  const s = getStripe();
  if (!s) throw new Error('Stripe is not configured');

  const amountCents = Math.round(amount * 100);
  const productName = `${description || `${serviceType} - ${packageTier}`}`;

  // Deactivate any prior pending payment links for this user so stale links
  // can't be paid later and trigger confirmations to the wrong conversation.
  await cancelPendingPaymentsForUser(userId, s);

  try {
    // Create a one-time price
    const price = await s.prices.create({
      currency: 'usd',
      unit_amount: amountCents,
      product_data: {
        name: productName,
      },
    });

    // Create a payment link
    const paymentLink = await s.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: {
        user_id: userId,
        phone_number: phoneNumber,
        service_type: serviceType || '',
        package_tier: packageTier || '',
      },
      after_completion: {
        type: 'redirect',
        redirect: { url: 'https://bytesplatform.com/thank-you' },
      },
    });

    // Store in DB
    const payment = await createPayment({
      userId,
      phoneNumber,
      paymentLinkId: paymentLink.id,
      paymentLinkUrl: paymentLink.url,
      amount: amountCents,
      currency: 'usd',
      serviceType,
      packageTier,
      description: productName,
      customerEmail,
      customerName,
      metadata: { stripe_price_id: price.id },
    });

    logger.info(`[STRIPE] Payment link created: ${paymentLink.url} | Amount: $${amount} | Service: ${serviceType}`);
    return { url: paymentLink.url, paymentId: payment.id, linkId: paymentLink.id };
  } catch (error) {
    logger.error('[STRIPE] Create payment link error:', error.message);
    throw error;
  }
}

/**
 * Check if a payment link has been paid by polling Stripe sessions.
 * Since we don't have webhooks, we poll the checkout sessions for the payment link.
 */
async function checkPaymentStatus(paymentLinkId) {
  const s = getStripe();
  if (!s) return null;

  try {
    const sessions = await s.checkout.sessions.list({
      payment_link: paymentLinkId,
      limit: 5,
    });

    for (const session of sessions.data) {
      if (session.payment_status === 'paid' || session.status === 'complete') {
        return {
          paid: true,
          sessionId: session.id,
          paymentIntentId: session.payment_intent,
          customerEmail: session.customer_details?.email || null,
          customerName: session.customer_details?.name || null,
          amountTotal: session.amount_total,
        };
      }
    }

    return { paid: false };
  } catch (error) {
    logger.error('[STRIPE] Check payment status error:', error.message);
    return { paid: false };
  }
}

/**
 * Poll and update payment status for a given payment link.
 * Called periodically or on-demand to sync Stripe status with DB.
 */
async function syncPaymentStatus(paymentLinkId, paymentDbId) {
  const result = await checkPaymentStatus(paymentLinkId);
  if (!result || !result.paid) return false;

  try {
    await updatePayment(paymentDbId, {
      status: 'paid',
      stripe_session_id: result.sessionId,
      stripe_payment_intent_id: result.paymentIntentId,
      customer_email: result.customerEmail,
      customer_name: result.customerName,
      paid_at: new Date().toISOString(),
    });
    logger.info(`[STRIPE] Payment ${paymentDbId} marked as paid`);
    return true;
  } catch (error) {
    logger.error('[STRIPE] Sync payment error:', error.message);
    return false;
  }
}

/**
 * Check all pending payments and update their status.
 * This is called from the admin panel or a scheduled task.
 */
async function syncAllPendingPayments() {
  const { supabase } = require('../config/database');
  const { data: pending } = await supabase
    .from('payments')
    .select('id, stripe_payment_link_id')
    .eq('status', 'pending')
    .not('stripe_payment_link_id', 'is', null);

  if (!pending || pending.length === 0) return { synced: 0, total: 0 };

  let synced = 0;
  for (const p of pending) {
    const paid = await syncPaymentStatus(p.stripe_payment_link_id, p.id);
    if (paid) synced++;
  }

  logger.info(`[STRIPE] Synced ${synced}/${pending.length} pending payments`);
  return { synced, total: pending.length };
}

/**
 * Mark any prior pending payments for a user as superseded and deactivate
 * the corresponding Stripe payment links. This prevents a user from paying
 * an old link (which could route the confirmation to the wrong conversation).
 */
async function cancelPendingPaymentsForUser(userId, stripeClient = null) {
  const { supabase } = require('../config/database');
  const { data: stale, error } = await supabase
    .from('payments')
    .select('id, stripe_payment_link_id')
    .eq('user_id', userId)
    .eq('status', 'pending');

  if (error) {
    logger.warn(`[STRIPE] Failed to query stale pending payments for user ${userId}: ${error.message}`);
    return;
  }
  if (!stale || stale.length === 0) return;

  const s = stripeClient || getStripe();

  for (const row of stale) {
    // Deactivate the old Stripe payment link so it can't be paid
    if (s && row.stripe_payment_link_id) {
      try {
        await s.paymentLinks.update(row.stripe_payment_link_id, { active: false });
      } catch (err) {
        // Common: link already inactive, or already completed. Not fatal.
        logger.debug(`[STRIPE] Could not deactivate link ${row.stripe_payment_link_id}: ${err.message}`);
      }
    }
    // Mark the DB row so the scheduler ignores it
    await supabase
      .from('payments')
      .update({ status: 'superseded' })
      .eq('id', row.id);
  }

  logger.info(`[STRIPE] Superseded ${stale.length} prior pending payment(s) for user ${userId}`);
}

module.exports = {
  createPaymentLink,
  checkPaymentStatus,
  syncPaymentStatus,
  syncAllPendingPayments,
  cancelPendingPaymentsForUser,
};
