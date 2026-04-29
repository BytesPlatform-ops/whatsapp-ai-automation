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
  const isDomainAddon = p.service_type === 'domain_addon';
  const isWebsitePayment = !isDomainAddon && (/website|web/i.test(p.service_type || '') || /website|web/i.test(p.description || ''));

  // ── Domain add-on (post-paid late domain purchase) ─────────────────────
  // The website was paid earlier; this is a separate charge for just the
  // domain. Skip the website-paid pipeline (no banner removal, no site
  // redeploy, no upsell pitch) — just register the domain, attach it to
  // the existing Netlify site, and send a focused confirmation.
  if (isDomainAddon) {
    const meta = paidUserRecord?.metadata || {};
    const selectedDomain = meta.selectedDomain;
    const { getLatestSite, updateSite } = require('../db/sites');

    if (!selectedDomain) {
      logger.error(`[PAY] domain_addon paid for ${p.id} but no selectedDomain on user metadata — manual setup needed`);
      await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () =>
        sendTextMessage(
          targetPhone,
          `Payment received! There was a hiccup looking up which domain you picked — our team will sort it out within 2 business days.`
        )
      );
      return { ok: true };
    }

    await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, async () => {
      await sendTextMessage(
        targetPhone,
        `Payment of *${amountDisplay}* received! 🎉\n\n` +
        `Now setting up *${selectedDomain}* for your website — this usually takes a few minutes. I'll keep you posted!`
      );
    });
    await logMessage(p.user_id, `Domain add-on payment confirmed: ${amountDisplay} — registering ${selectedDomain}`, 'assistant');

    const site = await getLatestSite(p.user_id);
    const netlifySubdomain = site?.netlify_subdomain || '';
    const netlifySiteId = site?.netlify_site_id || '';

    const hasNameSilo = !!process.env.NAMESILO_API_KEY;
    const hasNamecheap = !!env.namecheap?.apiKey;
    const registrarAvailable = hasNameSilo || hasNamecheap;

    if (registrarAvailable) {
      try {
        const registrarName = hasNameSilo ? 'namesilo' : 'namecheap';
        const { purchaseAndConfigureDomain } = require(
          hasNameSilo ? '../integrations/namesilo' : '../integrations/namecheap'
        );
        const { addCustomDomainToNetlify } = require('../website-gen/deployer');

        await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () =>
          sendTextMessage(targetPhone, `⏳ Registering *${selectedDomain}*...`)
        );

        logger.info(`[PAY] Late-domain addon: registrar=${registrarName} for ${selectedDomain}`);
        const result = await purchaseAndConfigureDomain(selectedDomain, netlifySubdomain);
        if (result.success) {
          if (netlifySiteId) {
            await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () =>
              sendTextMessage(targetPhone, `⏳ Attaching *${selectedDomain}* to your live site...`)
            );
            try {
              await addCustomDomainToNetlify(netlifySiteId, selectedDomain);
            } catch (e) {
              logger.error('[PAY] Late-domain Netlify attach failed:', e.message);
            }
          }
          if (site) await updateSite(site.id, { custom_domain: selectedDomain, status: 'domain_setup_complete' });
          await updateUserMetadata(p.user_id, {
            domainStatus: 'purchased',
            domainPurchasedAt: new Date().toISOString(),
          });
          await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () =>
            sendTextMessage(
              targetPhone,
              `✅ *${selectedDomain}* is registered and pointed at your site!\n\n` +
              `DNS is propagating now — it'll be live at *${selectedDomain}* within 5–60 minutes. ` +
              `HTTPS sets up automatically.\n\n` +
              `I'll ping you once it's fully live! 🚀`
            )
          );
          await logMessage(p.user_id, `Late-domain registered + attached: ${selectedDomain}`, 'assistant');
        } else {
          if (site) await updateSite(site.id, { custom_domain: selectedDomain, status: 'domain_setup_pending' });
          await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () =>
            sendTextMessage(
              targetPhone,
              `Domain registration for *${selectedDomain}* needs manual setup (${result.error}). Our team will handle it within 2 business days — we'll keep you posted!`
            )
          );
          await logMessage(p.user_id, `Late-domain auto-purchase failed: ${result.error} — manual setup needed`, 'assistant');
        }
      } catch (err) {
        logger.error('[PAY] Late-domain auto-purchase error:', err.message);
        try {
          if (site) await updateSite(site.id, { custom_domain: selectedDomain, status: 'domain_setup_pending' });
        } catch (_) { /* ignore */ }
        await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () =>
          sendTextMessage(targetPhone, `Domain setup for *${selectedDomain}* is being handled by our team. We'll update you within 2 business days!`)
        );
      }
    } else {
      if (site) await updateSite(site.id, { custom_domain: selectedDomain, status: 'domain_setup_pending' });
      await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () =>
        sendTextMessage(
          targetPhone,
          `Payment received! Our team will set up *${selectedDomain}* for your website within 2 business days. We'll send you the live link once it's ready!`
        )
      );
    }
    return { ok: true };
  }

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

    // ── 4a. Own-domain branch — customer already owns the domain, they
    //    just need DNS pointing instructions tailored to their registrar.
    //    No purchase happens; we send step-by-step setup guidance.
    if (selectedDomain && meta.domainChoice === 'own') {
      const site = await getLatestSite(p.user_id);
      const netlifySubdomain = site?.netlify_subdomain || '';
      const registrar = meta.domainRegistrar || 'your registrar';

      const { generateDnsInstructions } = require('../website-gen/dnsInstructions');
      const instructions = await generateDnsInstructions({
        registrar,
        domain: selectedDomain,
        netlifySubdomain,
        userId: p.user_id,
      });

      await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, async () => {
        await sendTextMessage(
          targetPhone,
          `Payment of *${amountDisplay}* received! 🎉\n\n` +
            `Your site is live at: ${site?.preview_url || 'your preview URL'}\n\n` +
            `Now let's point *${selectedDomain}* at it 👇`
        );
        await sendTextMessage(targetPhone, instructions);
        await sendTextMessage(
          targetPhone,
          `_If anything's off later or you've got thoughts on the site, just type *feedback* any time and i'll capture it for the team._`
        );
      });
      await logMessage(
        p.user_id,
        `Payment confirmed: ${amountDisplay} — DNS instructions sent for own domain ${selectedDomain} (${registrar})`,
        'assistant'
      );

      if (site) {
        await updateSite(site.id, { custom_domain: selectedDomain, status: 'domain_dns_pending' });
      }

      // Feedback: the site is live at the preview URL and the customer
      // has their DNS instructions — that's "delivered" from our side.
      // Skipped for testers and when more services are queued, handled
      // inside scheduleDeliveryPrompt.
      try {
        const { scheduleDeliveryPrompt } = require('../feedback/feedback');
        await scheduleDeliveryPrompt(
          {
            id: p.user_id,
            phone_number: targetPhone,
            channel: targetChannel,
            via_phone_number_id: targetVia,
            metadata: paidUserRecord?.metadata || {},
          },
          'website'
        );
      } catch (err) {
        logger.warn(`[PAY] scheduleDeliveryPrompt (own-domain) failed: ${err.message}`);
      }
    }
    // ── 4b. New-domain flow (we register + configure DNS on our side).
    //    Triggers when the customer asked us to find a domain and picked
    //    one from the search results (domainChoice = 'need').
    else if (selectedDomain && meta.domainChoice === 'need') {
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

      // Pick the active registrar: NameSilo primary (no IP whitelist),
      // Namecheap legacy fallback. postPayment only needs the one that's
      // configured via env — the purchaseAndConfigureDomain signatures
      // are identical across both integrations.
      const hasNameSilo = !!process.env.NAMESILO_API_KEY;
      const hasNamecheap = !!env.namecheap?.apiKey;
      const registrarAvailable = hasNameSilo || hasNamecheap;

      if (registrarAvailable) {
        try {
          const registrarName = hasNameSilo ? 'namesilo' : 'namecheap';
          const { purchaseAndConfigureDomain } = require(
            hasNameSilo ? '../integrations/namesilo' : '../integrations/namecheap'
          );
          const { addCustomDomainToNetlify } = require('../website-gen/deployer');

          await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () =>
            sendTextMessage(targetPhone, `⏳ Registering *${selectedDomain}*...`)
          );

          logger.info(`[PAY] Using registrar=${registrarName} for ${selectedDomain}`);
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
                `I'll send you a message once it's fully live! 🚀\n\n` +
                `_If anything's off later or you've got thoughts, just type *feedback* any time and i'll capture it for the team._`
              )
            );
            await logMessage(p.user_id, `Domain purchased and configured: ${selectedDomain}`, 'assistant');

            // Phase 15: record completion so future sessions can
            // reference this project by business name.
            try {
              const wd = paidUserRecord?.metadata?.websiteData || {};
              if (wd.businessName) {
                await updateUserMetadata(p.user_id, {
                  lastBusinessName: wd.businessName,
                  lastCompletedProjectType: 'website',
                  lastCompletedProjectAt: new Date().toISOString(),
                });
              }
            } catch (err) {
              logger.warn(`[PAY] Failed to mark return-greet fields: ${err.message}`);
            }

            // Feedback: schedule the post-delivery prompt 30s after
            // the go-live message. Skipped for testers + when more
            // services are queued.
            try {
              const { scheduleDeliveryPrompt } = require('../feedback/feedback');
              await scheduleDeliveryPrompt(
                {
                  id: p.user_id,
                  phone_number: targetPhone,
                  channel: targetChannel,
                  via_phone_number_id: targetVia,
                  metadata: paidUserRecord?.metadata || {},
                },
                'website'
              );
            } catch (err) {
              logger.warn(`[PAY] scheduleDeliveryPrompt failed: ${err.message}`);
            }

            // Phase 12: if the user originally queued more services with
            // the website, advance to the next one instead of the
            // generic site-live upsell. The explicit queue wins over
            // the guess-based upsell.
            const queuedServices = Array.isArray(paidUserRecord?.metadata?.serviceQueue)
              ? paidUserRecord.metadata.serviceQueue
              : [];
            if (queuedServices.length > 0) {
              const { maybeStartNextQueuedService } = require('../conversation/serviceQueue');
              const { updateUserState } = require('../db/users');
              const queueUser = {
                id: p.user_id,
                phone_number: targetPhone,
                channel: targetChannel,
                via_phone_number_id: targetVia,
                metadata: paidUserRecord.metadata,
              };
              try {
                const newState = await runWithContext(
                  { channel: targetChannel, phoneNumberId: targetVia },
                  () => maybeStartNextQueuedService(queueUser)
                );
                if (newState) {
                  await updateUserState(p.user_id, newState);
                }
              } catch (err) {
                logger.error(`[PAY] Queue advance after site-live failed: ${err.message}`);
              }
            } else {
              // Phase 16 (in-bot cross-sell): pitch the most useful next
              // service the user hasn't touched. Site is fully paid +
              // configured here, so the moment is right. Idempotent.
              await maybeSendSiteLiveUpsell({
                userId: p.user_id,
                phone: targetPhone,
                channel: targetChannel,
                via: targetVia,
                metadata: paidUserRecord?.metadata,
              });
            }
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
      // Regular website payment with no domain selected (user chose "skip"
      // during WEB_DOMAIN_CHOICE). Just confirm — do NOT re-offer a domain.
      // In the new flow, domain selection is always resolved pre-preview,
      // so asking again here would be redundant and dilute the close.

      // Move the row to a terminal status so the 23h siteCleanup query
      // doesn't include it. Domain branches already do this implicitly
      // by transitioning to 'domain_setup_complete' / 'domain_dns_pending';
      // the no-domain branch was previously the only paid path that
      // left status='approved', leaving the row in the cleanup query and
      // protected only by the (fire-and-forget) redeployAsPaid writing
      // site_data.paymentStatus='paid'. Setting the column directly is
      // belt-and-suspenders.
      try {
        const paidSite = await getLatestSite(p.user_id);
        if (paidSite?.id) {
          await updateSite(paidSite.id, { status: 'paid' });
        }
      } catch (err) {
        logger.warn(`[PAY] Failed to mark no-domain site status='paid': ${err.message}`);
      }

      await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () => sendTextMessage(
        targetPhone,
        `Payment of *${amountDisplay}* received! 🎉\n\n` +
          `*Package:* ${p.description || p.service_type}\n\n` +
          `Your site is fully yours — watermark gone, contact form live. I'm here if you need anything — and if anything's off later or you've got thoughts, just type *feedback* any time and i'll capture it for the team.`
      ));
      await logMessage(p.user_id, `Payment confirmed: ${amountDisplay} (no domain)`, 'assistant');

      // Feedback: site is live on its preview URL — that's a fully
      // delivered state. Skipped for testers and when more services
      // are queued, handled inside scheduleDeliveryPrompt.
      try {
        const { scheduleDeliveryPrompt } = require('../feedback/feedback');
        await scheduleDeliveryPrompt(
          {
            id: p.user_id,
            phone_number: targetPhone,
            channel: targetChannel,
            via_phone_number_id: targetVia,
            metadata: paidUserRecord?.metadata || {},
          },
          'website'
        );
      } catch (err) {
        logger.warn(`[PAY] scheduleDeliveryPrompt (no-domain) failed: ${err.message}`);
      }

      // INTENTIONALLY DO NOT change state to SALES_CHAT here. Paid users
      // need to stay in WEB_REVISIONS so the unlimited-revisions perk
      // and the late-domain-add intent both keep firing through
      // handleRevisions. Forcing them into salesBot meant "I want a
      // domain" turned into chatty hallucination instead of running
      // Namecheap search + creating a domain_addon Stripe link.
    }
  } else {
    // Non-website payment
    await runWithContext({ channel: targetChannel, phoneNumberId: targetVia }, () => sendTextMessage(
      targetPhone,
      `Payment of *${amountDisplay}* received! Thank you for choosing Pixie.\n\n` +
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

/**
 * One soft cross-sell pitch right after a website is confirmed paid.
 * Picks the most useful NEXT service the user hasn't touched yet:
 *
 *   1. No SEO audit done → free SEO audit (natural first move for a new site)
 *   2. SEO audit done, no logo → logo pitch
 *   3. SEO + logo done, no chatbot → chatbot pitch
 *   4. Everything already touched → skip
 *
 * Idempotent via metadata.postWebsiteUpsellSent so a webhook+scheduler
 * double-fire can't pitch twice. Tone is intentionally low-pressure —
 * "say X whenever" rather than "do you want X now".
 *
 * Called only from the "site is actually live / all set" moments in
 * handleConfirmedPayment — never from the pending / manual-setup
 * branches, because those aren't final user-happy states.
 */
async function maybeSendSiteLiveUpsell({ userId, phone, channel, via, metadata }) {
  const md = metadata || {};
  if (md.postWebsiteUpsellSent) return; // already pitched once

  const hadAudit = !!md.seoAuditCompletedAt || !!md.seoAuditTriggered || !!md.lastSeoUrl;
  const hadLogo = !!(md.logoData && (md.logoData.businessName || md.logoData.ideas));
  const hadChatbot = !!(md.chatbotData && (md.chatbotData.businessName || md.chatbotData.faqs));

  let pitch = null;
  let pitched = null;
  if (!hadAudit) {
    pitch = `btw — whenever you've had a chance to poke around the site, say *audit* and i'll run a free SEO check on it. no cost, just useful to know what Google will see.`;
    pitched = 'seo_audit';
  } else if (!hadLogo) {
    pitch = `btw — since the site is live, say *logo* anytime and i can design a few concepts to match. no charge to see what i'd do.`;
    pitched = 'logo';
  } else if (!hadChatbot) {
    pitch = `btw — say *chatbot* anytime and i can spin up a 24/7 AI assistant for your site, trained on your services + FAQs. takes like 2 minutes to see a demo.`;
    pitched = 'chatbot';
  } else {
    // User has already touched every related service — nothing useful to pitch.
    await updateUserMetadata(userId, { postWebsiteUpsellSent: true });
    return;
  }

  try {
    await runWithContext({ channel, phoneNumberId: via }, () => sendTextMessage(phone, pitch));
    await logMessage(userId, `Post-website upsell pitch sent (${pitched})`, 'assistant');
    await updateUserMetadata(userId, {
      postWebsiteUpsellSent: true,
      postWebsiteUpsellKind: pitched,
      postWebsiteUpsellAt: new Date().toISOString(),
    });
    logger.info(`[PAY] Site-live upsell pitched (${pitched}) to ${phone}`);
  } catch (err) {
    // Never block the confirmation flow — the core payment UX already
    // completed before we got here.
    logger.warn(`[PAY] Site-live upsell failed for ${phone}: ${err.message}`);
  }
}

module.exports = { handleConfirmedPayment };
