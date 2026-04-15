const { supabase } = require('../config/database');
const { getConversationHistory } = require('./conversations');
const { generateResponse } = require('../llm/provider');
const { logger } = require('../utils/logger');

const SUMMARY_PROMPT = `You are summarizing a sales conversation for a CRM. Based on the conversation below, extract and return a JSON object with these fields:

{
  "business_name": "the client's business name if mentioned, or null",
  "industry": "the client's industry/niche if mentioned, or null",
  "services_discussed": "comma-separated list of services the client was interested in (e.g. website, SEO, chatbot)",
  "budget_range": "the budget range discussed (e.g. '$200-$300') or null if not discussed",
  "summary": "A 2-4 sentence summary of the conversation: what the client wanted, what was offered, what happened, and the final outcome. Be specific and factual."
}

Return ONLY valid JSON. No markdown, no explanation.`;

/**
 * Generate and save a lead summary when a conversation reaches a terminal state.
 * @param {Object} user - The user object from DB
 * @param {string} outcome - 'paid', 'meeting_booked', 'opted_out', 'declined'
 * @param {string} [outcomeDetails] - Additional context (e.g. "Paid $300 for website", "User said not interested")
 */
async function saveLeadSummary(user, outcome, outcomeDetails = '') {
  try {
    const history = await getConversationHistory(user.id, 60);
    if (!history || history.length === 0) return;

    const totalMessages = history.length;
    const firstMessageAt = history[history.length - 1]?.created_at;
    const lastMessageAt = history[0]?.created_at;

    // Build conversation text for LLM
    const conversationText = history
      .reverse()
      .map(m => `${m.role}: ${m.message_text}`)
      .join('\n');

    // Generate summary via LLM
    let summary = '';
    let businessName = user.business_name || user.metadata?.websiteData?.businessName || '';
    let industry = user.metadata?.websiteData?.industry || '';
    let servicesDiscussed = '';
    let budgetRange = '';

    try {
      const response = await generateResponse(SUMMARY_PROMPT, [
        { role: 'user', content: conversationText.slice(-4000) }, // last ~4000 chars
      ], { userId: user.id, operation: 'lead_summary' });
      const jsonMatch = response.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        summary = parsed.summary || '';
        if (parsed.business_name && !businessName) businessName = parsed.business_name;
        if (parsed.industry && !industry) industry = parsed.industry;
        servicesDiscussed = parsed.services_discussed || '';
        budgetRange = parsed.budget_range || '';
      }
    } catch (err) {
      logger.error('[LEAD SUMMARY] LLM summary generation failed:', err.message);
      summary = `${totalMessages} messages exchanged. Outcome: ${outcome}. ${outcomeDetails}`;
    }

    // Save to DB
    const { error } = await supabase.from('lead_summaries').insert({
      user_id: user.id,
      phone_number: user.phone_number,
      channel: user.channel || 'whatsapp',
      name: user.name || user.metadata?.contactName || '',
      business_name: businessName,
      industry,
      services_discussed: servicesDiscussed,
      budget_range: budgetRange,
      lead_temperature: user.metadata?.leadTemperature || 'WARM',
      ad_source: user.metadata?.adSource || '',
      outcome,
      outcome_details: outcomeDetails,
      conversation_summary: summary,
      total_messages: totalMessages,
      first_message_at: firstMessageAt,
      last_message_at: lastMessageAt,
    });

    if (error) {
      logger.error('[LEAD SUMMARY] DB insert failed:', error.message);
    } else {
      logger.info(`[LEAD SUMMARY] Saved for ${user.phone_number}: ${outcome} — ${summary.slice(0, 100)}`);
    }
  } catch (err) {
    logger.error('[LEAD SUMMARY] Error saving lead summary:', err.message);
  }
}

module.exports = { saveLeadSummary };
