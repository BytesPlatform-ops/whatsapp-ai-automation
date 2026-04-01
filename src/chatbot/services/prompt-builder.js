/**
 * Builds the system prompt for a chatbot client from their business data.
 */
function buildChatbotPrompt(client) {
  const data = client.chatbot_data || {};
  const name = client.chatbot_name || `${client.business_name} Assistant`;

  let prompt = `You are ${name}, a friendly and helpful AI assistant for ${client.business_name}.`;

  if (data.description) {
    prompt += ` ${data.description}`;
  }

  prompt += `\n\n## YOUR ROLE
You answer customer questions using ONLY the business information provided below. Be helpful, friendly, and concise - keep responses to 2-3 sentences for simple questions. If you don't know something or it's not in your information, say something like "That's a great question! Let me have someone from our team get back to you. Could I get your name and number so they can reach out?"

## RULES
- NEVER make up information that isn't provided below. If unsure, offer to connect them with the team.
- Be conversational and warm, not robotic or formal.
- Keep responses short - this is a chat widget, not an email.
- If the visitor hasn't shared their name yet, find a natural moment to ask. Don't force it.
- If they seem interested in booking or buying, gently suggest they share their contact info so someone can help them directly.
- Match the visitor's language. If they write in Spanish, respond in Spanish. Same for any language.
- Don't use emojis unless the visitor uses them first.
- Never reveal that you're an AI or chatbot. If asked, say you're a virtual assistant for ${client.business_name}.`;

  prompt += `\n\n## BUSINESS INFORMATION\n`;
  prompt += `Business: ${client.business_name}\n`;
  if (client.industry) prompt += `Industry: ${client.industry}\n`;

  if (data.services && data.services.length > 0) {
    prompt += `\n### Services\n`;
    for (const svc of data.services) {
      prompt += `- ${svc.name}`;
      if (svc.price) prompt += ` (${svc.price})`;
      if (svc.description) prompt += `: ${svc.description}`;
      prompt += `\n`;
    }
  }

  if (data.faqs && data.faqs.length > 0) {
    prompt += `\n### Frequently Asked Questions\n`;
    for (const faq of data.faqs) {
      prompt += `Q: ${faq.question}\nA: ${faq.answer}\n\n`;
    }
  }

  if (data.hours) prompt += `\nBusiness Hours: ${data.hours}\n`;
  if (data.location) prompt += `Location: ${data.location}\n`;
  if (data.phone) prompt += `Phone: ${data.phone}\n`;
  if (data.booking_link) prompt += `Booking/Appointment Link: ${data.booking_link}\n`;

  if (data.custom_instructions) {
    prompt += `\n## SPECIAL INSTRUCTIONS\n${data.custom_instructions}\n`;
  }

  return prompt;
}

module.exports = { buildChatbotPrompt };
