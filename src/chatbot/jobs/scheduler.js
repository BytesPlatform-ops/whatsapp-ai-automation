const { supabase } = require('../../config/database');
const { sendTextMessage } = require('../../messages/sender');
const { logMessage } = require('../../db/conversations');
const { updateUserMetadata } = require('../../db/users');
const { logger } = require('../../utils/logger');
const { getAnalyticsSummary } = require('../db/analytics');
const { getConversationsByClient } = require('../db/conversations');
const { updateClient } = require('../db/clients');

/**
 * Trial expiry checker - runs daily.
 * Sends WhatsApp reminders and pauses expired trials.
 */
async function runTrialExpiryCheck() {
  logger.info('[CHATBOT-JOBS] Running trial expiry check...');

  try {
    const now = new Date();

    // Get all trial clients
    const { data: trialClients, error } = await supabase
      .from('chatbot_clients')
      .select('*')
      .eq('status', 'trial')
      .not('trial_ends_at', 'is', null);

    if (error) {
      logger.error('[CHATBOT-JOBS] Trial query error:', error.message);
      return;
    }

    if (!trialClients || trialClients.length === 0) return;

    for (const client of trialClients) {
      const trialEnd = new Date(client.trial_ends_at);
      const hoursLeft = (trialEnd - now) / (1000 * 60 * 60);

      // Get analytics for this client's trial period
      const analytics = await getAnalyticsSummary(client.client_id, 7);

      if (hoursLeft <= 0) {
        // Trial expired - pause the chatbot
        await updateClient(client.client_id, { status: 'paused' });

        // Notify owner via WhatsApp
        if (client.owner_phone) {
          const msg = `Hey${client.owner_name ? ' ' + client.owner_name : ''}! Your 7-day chatbot trial for *${client.business_name}* has ended.\n\n` +
            `During the trial, your bot handled *${analytics.total_conversations}* conversations and captured *${analytics.leads_captured}* leads.\n\n` +
            `Ready to keep it going? Reply with your preferred tier:\n` +
            `- *Starter* ($97/mo) - 500 conversations/mo\n` +
            `- *Growth* ($249/mo) - Unlimited conversations\n` +
            `- *Premium* ($599/mo) - Everything + custom integrations`;

          try {
            await sendTextMessage(client.owner_phone, msg);
            logger.info(`[CHATBOT-JOBS] Trial expiry notice sent to ${client.owner_phone} for ${client.client_id}`);
          } catch (sendErr) {
            logger.error(`[CHATBOT-JOBS] Failed to send trial expiry notice to ${client.owner_phone}:`, sendErr.message);
          }
        }
      } else if (hoursLeft <= 24 && hoursLeft > 23) {
        // 24-hour warning
        if (client.owner_phone) {
          const msg = `Hey${client.owner_name ? ' ' + client.owner_name : ''}! Just a heads up - your chatbot trial for *${client.business_name}* ends tomorrow.\n\n` +
            `So far it's handled *${analytics.total_conversations}* conversations and captured *${analytics.leads_captured}* leads. Not bad for a few days!\n\n` +
            `Want to keep it running? Just reply and I'll help you pick the right plan.`;

          try {
            await sendTextMessage(client.owner_phone, msg);
            logger.info(`[CHATBOT-JOBS] Trial 24h warning sent to ${client.owner_phone} for ${client.client_id}`);
          } catch (sendErr) {
            logger.error(`[CHATBOT-JOBS] Failed to send trial warning to ${client.owner_phone}:`, sendErr.message);
          }
        }
      }
    }
  } catch (err) {
    logger.error('[CHATBOT-JOBS] Trial expiry check error:', err.message);
  }
}

/**
 * Monthly performance report - runs on the 1st of each month.
 * Sends a WhatsApp summary to all active/trial clients.
 */
async function runMonthlyReport() {
  logger.info('[CHATBOT-JOBS] Running monthly reports...');

  try {
    const { data: activeClients, error } = await supabase
      .from('chatbot_clients')
      .select('*')
      .in('status', ['active', 'trial']);

    if (error) {
      logger.error('[CHATBOT-JOBS] Monthly report query error:', error.message);
      return;
    }

    if (!activeClients || activeClients.length === 0) return;

    for (const client of activeClients) {
      if (!client.owner_phone) continue;

      try {
        const analytics = await getAnalyticsSummary(client.client_id, 30);
        const conversations = await getConversationsByClient(client.client_id, 200);

        // Extract top questions
        const questions = {};
        for (const convo of conversations) {
          const msgs = convo.messages || [];
          for (const msg of msgs) {
            if (msg.role === 'user' && msg.content && msg.content.length > 5) {
              const normalized = msg.content.toLowerCase().replace(/[?!.,]/g, '').trim().slice(0, 60);
              questions[normalized] = (questions[normalized] || 0) + 1;
            }
          }
        }
        const topQuestions = Object.entries(questions)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);

        // Build report message
        let msg = `Here's your monthly chatbot report for *${client.business_name}*!\n\n` +
          `*Last 30 Days:*\n` +
          `- Conversations: ${analytics.total_conversations}\n` +
          `- Messages: ${analytics.total_messages}\n` +
          `- Leads captured: ${analytics.leads_captured}\n` +
          `- Unique visitors: ${analytics.unique_visitors}`;

        if (topQuestions.length > 0) {
          msg += `\n\n*Top questions asked:*\n`;
          topQuestions.forEach(([q, count], i) => {
            msg += `${i + 1}. "${q}" (${count}x)\n`;
          });
        }

        // Upsell nudge for Starter/Growth
        if (client.tier === 'starter') {
          msg += `\n\nYou're on the Starter plan. Upgrade to *Growth ($249/mo)* for unlimited conversations and advanced analytics. Reply if interested!`;
        } else if (client.tier === 'growth') {
          msg += `\n\nReady for the next level? Our *Premium plan ($599/mo)* includes custom integrations and a dedicated account manager. Reply for details!`;
        }

        await sendTextMessage(client.owner_phone, msg);
        logger.info(`[CHATBOT-JOBS] Monthly report sent to ${client.owner_phone} for ${client.client_id}`);
      } catch (sendErr) {
        logger.error(`[CHATBOT-JOBS] Failed to send monthly report for ${client.client_id}:`, sendErr.message);
      }
    }
  } catch (err) {
    logger.error('[CHATBOT-JOBS] Monthly report error:', err.message);
  }
}

/**
 * Demo follow-up - sends a follow-up 5 minutes after demo is generated.
 */
async function runDemoFollowups() {
  try {
    // Find users who got a demo 5+ minutes ago but haven't been followed up
    const { data: users, error } = await supabase
      .from('users')
      .select('id, phone_number, name, metadata')
      .eq('state', 'CB_DEMO_SENT');

    if (error || !users) return;

    const now = Date.now();
    for (const user of users) {
      const demoSentAt = user.metadata?.chatbotDemoSentAt;
      const followedUp = user.metadata?.chatbotDemoFollowedUp;
      if (!demoSentAt || followedUp) continue;

      const elapsed = now - new Date(demoSentAt).getTime();
      // 5-10 minute window
      if (elapsed >= 5 * 60 * 1000 && elapsed < 10 * 60 * 1000) {
        try {
          await sendTextMessage(
            user.phone_number,
            "How's the chatbot looking? Pretty cool, right? Here's what it can do on a paid plan:\n\n" +
            "*Starter ($97/mo)* - Up to 500 conversations/mo, widget embed, lead capture\n" +
            "*Growth ($249/mo)* - Unlimited conversations, priority support, advanced analytics\n" +
            "*Premium ($599/mo)* - Everything + custom integrations, dedicated account manager\n\n" +
            "All plans start with a *7-day free trial* - no payment needed to start! Want to try it?"
          );

          await logMessage(user.id, 'Chatbot demo follow-up sent', 'assistant');
          await updateUserMetadata(user.id, { chatbotDemoFollowedUp: true });

          logger.info(`[CHATBOT-JOBS] Demo follow-up sent to ${user.phone_number}`);
        } catch (sendErr) {
          logger.error(`[CHATBOT-JOBS] Demo follow-up failed for ${user.phone_number}:`, sendErr.message);
        }
      }
    }
  } catch (err) {
    logger.error('[CHATBOT-JOBS] Demo follow-up error:', err.message);
  }
}

/**
 * Start all chatbot scheduled jobs.
 */
function startChatbotScheduler() {
  // Trial expiry check - every hour
  setInterval(runTrialExpiryCheck, 60 * 60 * 1000);

  // Demo follow-ups - every 2 minutes
  setInterval(runDemoFollowups, 2 * 60 * 1000);

  // Monthly report - check daily at midnight-ish, only send on 1st
  setInterval(() => {
    const today = new Date();
    if (today.getDate() === 1 && today.getHours() === 9 && today.getMinutes() < 30) {
      runMonthlyReport();
    }
  }, 30 * 60 * 1000);

  // Run demo follow-ups immediately on start
  runDemoFollowups();

  logger.info('[CHATBOT-JOBS] Chatbot scheduler started');
}

module.exports = { startChatbotScheduler, runTrialExpiryCheck, runMonthlyReport, runDemoFollowups };
