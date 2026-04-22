// Stripe webhook endpoint — detects payment success in real time.
//
// Why this beats the 2-min poller: when a customer pays via the
// "Activate Now" banner button (or the WhatsApp-sent Stripe link), the
// scheduler may take up to 2 minutes to notice. The webhook fires in
// ~1-2 seconds, so the activation banner disappears and the owner gets
// their confirmation almost instantly.
//
// The scheduler is NOT removed — it still polls at a reduced cadence as
// a safety net for the handful of cases where the webhook might miss
// (Render downtime during deploy, Stripe temporary delivery failure).
// handleConfirmedPayment is idempotent, so scheduler + webhook firing
// for the same payment is safe.

const express = require('express');
const Stripe = require('stripe');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { supabase } = require('../config/database');
const { handleConfirmedPayment } = require('./postPayment');

const router = express.Router();

// Lazy-init Stripe client so we don't crash at boot if the secret is
// missing (e.g. the bot runs locally without Stripe configured for dev).
let stripe = null;
function getStripe() {
  if (!stripe && env.stripe?.secretKey) {
    stripe = new Stripe(env.stripe.secretKey);
  }
  return stripe;
}

/**
 * POST /webhook/stripe
 *
 * MUST receive the raw request body (not JSON-parsed) — signature
 * verification depends on the exact bytes Stripe signed. The route is
 * mounted with express.raw() specifically to preserve that. Any change
 * to the body middleware order in index.js will break signature
 * verification silently (Stripe will reject all events as bad sigs).
 */
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const secret = env.stripe?.webhookSecret;
  const s = getStripe();

  if (!secret) {
    logger.error('[STRIPE-WEBHOOK] STRIPE_WEBHOOK_SECRET not configured — rejecting');
    return res.status(503).send('webhook secret not configured');
  }
  if (!s) {
    logger.error('[STRIPE-WEBHOOK] Stripe client not initialised');
    return res.status(503).send('stripe not configured');
  }

  let event;
  try {
    event = s.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    logger.warn(`[STRIPE-WEBHOOK] Signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Respond 200 FAST — Stripe times out the delivery after 5s and will
  // retry. Do the real work in a fire-and-forget background promise so
  // a slow downstream (Netlify redeploy, WhatsApp API) never causes a
  // false-negative retry from Stripe.
  res.status(200).json({ received: true, type: event.type });

  // ── Event dispatch ────────────────────────────────────────────────
  (async () => {
    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutSessionCompleted(s, event.data.object);
          break;
        case 'checkout.session.async_payment_succeeded':
          // Bank-redirect flows (ACH, bank transfer) confirm asynchronously.
          await handleCheckoutSessionCompleted(s, event.data.object);
          break;
        case 'charge.refunded':
          await handleChargeRefunded(s, event.data.object);
          break;
        default:
          logger.debug(`[STRIPE-WEBHOOK] Ignoring unhandled event type: ${event.type}`);
      }
    } catch (err) {
      logger.error(`[STRIPE-WEBHOOK] Handler threw for ${event.type}: ${err.message}`);
    }
  })();
});

/**
 * Dispatch a completed checkout session to our post-payment pipeline.
 * Resolves the matching payments row by stripe_payment_link_id (that's
 * the one we stored at createPaymentLink time) and then hands off to
 * the shared handler.
 */
async function handleCheckoutSessionCompleted(stripeClient, session) {
  if (!session?.id) return;
  const paid = session.payment_status === 'paid' || session.status === 'complete';
  if (!paid) {
    logger.info(`[STRIPE-WEBHOOK] Session ${session.id} completed but not paid yet (status=${session.payment_status})`);
    return;
  }

  // Prefer lookup by payment_link (what we originally saved), fall back to
  // payment_intent (direct-charge flows), then customer_email as last resort.
  const paymentLinkId = session.payment_link || null;
  const paymentIntentId = session.payment_intent || null;

  let paymentRow = null;
  if (paymentLinkId) {
    const { data } = await supabase
      .from('payments')
      .select('*')
      .eq('stripe_payment_link_id', paymentLinkId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    paymentRow = data;
  }
  if (!paymentRow && paymentIntentId) {
    const { data } = await supabase
      .from('payments')
      .select('*')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle();
    paymentRow = data;
  }
  // Some sessions may have a custom metadata.user_id set when we created
  // the link — last-resort lookup for sessions we lost track of.
  if (!paymentRow && session.metadata?.user_id) {
    const { data } = await supabase
      .from('payments')
      .select('*')
      .eq('user_id', session.metadata.user_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    paymentRow = data;
  }

  if (!paymentRow) {
    logger.warn(`[STRIPE-WEBHOOK] No payments row found for session ${session.id} (link=${paymentLinkId}, intent=${paymentIntentId})`);
    return;
  }

  logger.info(`[STRIPE-WEBHOOK] Processing paid session ${session.id} → payment ${paymentRow.id}`);
  const result = await handleConfirmedPayment(paymentRow, session);
  if (result.skipped) {
    logger.info(`[STRIPE-WEBHOOK] Payment ${paymentRow.id} already processed (idempotent)`);
  } else if (!result.ok) {
    logger.error(`[STRIPE-WEBHOOK] handleConfirmedPayment failed: ${result.reason}`);
  }
}

/**
 * Handle a charge.refunded event. Looks up the original payment by
 * stripe_payment_intent_id, marks it refunded, and redeploys the user's
 * paid site back into preview mode (banner reappears, forms re-lock).
 *
 * Idempotent — Stripe may re-send the event (partial refund follow-ups,
 * delivery retries). Second call short-circuits on the 'refunded' status.
 */
async function handleChargeRefunded(stripeClient, charge) {
  if (!charge?.id) return;
  const paymentIntentId = charge.payment_intent || null;
  if (!paymentIntentId) {
    logger.warn(`[STRIPE-WEBHOOK] Refund charge ${charge.id} has no payment_intent — cannot match to payments row`);
    return;
  }

  const { data: payment } = await supabase
    .from('payments')
    .select('*')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle();

  if (!payment) {
    logger.warn(`[STRIPE-WEBHOOK] No payment row found for refunded charge ${charge.id} (intent=${paymentIntentId})`);
    return;
  }
  if (payment.status === 'refunded') {
    logger.info(`[STRIPE-WEBHOOK] Payment ${payment.id} already marked refunded — skipping`);
    return;
  }

  // Mark the payment refunded. Refund details go in metadata so no schema
  // migration is needed; auditing queries can read them from the JSONB.
  await supabase
    .from('payments')
    .update({
      status: 'refunded',
      metadata: {
        ...(payment.metadata || {}),
        refund: {
          charge_id: charge.id,
          amount_refunded: charge.amount_refunded,
          refunded_at: new Date().toISOString(),
        },
      },
    })
    .eq('id', payment.id);

  // Re-gate the user's paid site. Fetch all of this user's sites and pick
  // the most recent one currently in 'paid' state — that's the one this
  // refund maps to. (Payments aren't linked to a specific site row, so
  // the mapping is by "which site was flipped to paid most recently".)
  const { data: sites } = await supabase
    .from('generated_sites')
    .select('id, site_data, created_at, netlify_site_id')
    .eq('user_id', payment.user_id)
    .order('created_at', { ascending: false });
  const paidSite = (sites || []).find((s) => s.site_data?.paymentStatus === 'paid');

  if (!paidSite) {
    logger.warn(`[STRIPE-WEBHOOK] Refund for payment ${payment.id}: no paid site found for user ${payment.user_id} — nothing to revert`);
    return;
  }

  try {
    const { redeployAsPreview } = require('../website-gen/redeployer');
    // Reuse the original payment link so the banner still points at a
    // working URL. If the user wants a fresh quote they can ask the bot
    // and createPaymentLink will regenerate + resync via updateSiteBannerLink.
    const result = await redeployAsPreview(paidSite.id, payment.stripe_payment_link_url || null);
    if (result.ok) {
      logger.info(`[STRIPE-WEBHOOK] Reverted site ${paidSite.id} to preview after refund (payment ${payment.id})`);
    } else {
      logger.error(`[STRIPE-WEBHOOK] redeployAsPreview failed for site ${paidSite.id}: ${result.reason}`);
    }
  } catch (err) {
    logger.error(`[STRIPE-WEBHOOK] Refund revert threw for site ${paidSite.id}: ${err.message}`);
  }
}

module.exports = router;
