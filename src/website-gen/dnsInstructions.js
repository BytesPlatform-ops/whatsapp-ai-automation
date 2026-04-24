/**
 * Registrar-specific DNS setup instructions for "own domain" customers.
 *
 * When a customer brings their own domain (bought elsewhere — GoDaddy,
 * Namecheap, Cloudflare, etc.), we need to give them exact UI steps for
 * THEIR registrar on how to point the domain at our Netlify deploy.
 * Generic "add an A record" instructions aren't enough — each registrar's
 * dashboard is different, and customers get lost.
 *
 * We use the LLM to generate tailored steps because:
 *   - Hundreds of registrars exist, maintaining a hard-coded list is brittle
 *   - Registrar UIs change — canned steps go stale
 *   - The LLM can confidently describe common registrars (GoDaddy, Namecheap,
 *     Cloudflare, etc.) and produce sensible generic steps for anything obscure
 *
 * The LLM is constrained tightly (see the prompt) to always include the exact
 * Netlify records our deploys need: A @ → 75.2.60.5 and CNAME www → subdomain.
 */

const { generateResponse } = require('../llm/provider');
const { logger } = require('../utils/logger');

const NETLIFY_LOAD_BALANCER_IP = '75.2.60.5';

const COMMON_REGISTRARS = [
  'GoDaddy',
  'Namecheap',
  'Cloudflare',
  'Google Domains',
  'Squarespace Domains',
  'NameSilo',
  'Porkbun',
  'Hostinger',
  'Bluehost',
  'Name.com',
  'Dynadot',
  'Gandi',
  'Network Solutions',
];

function registrarOptionsList() {
  return COMMON_REGISTRARS.slice(0, 8).join(', ');
}

/**
 * Generate DNS setup instructions for a specific registrar + domain +
 * Netlify subdomain combo. Returns a WhatsApp-safe plain-text string with
 * numbered steps. Falls back to a generic canned message if the LLM call
 * fails entirely — the customer always gets something actionable.
 */
async function generateDnsInstructions({ registrar, domain, netlifySubdomain, userId }) {
  const reg = String(registrar || '').trim() || 'your registrar';
  const netlifyHost = `${netlifySubdomain}.netlify.app`;

  const systemPrompt =
    'You are a helpful tech support expert. Write WhatsApp-friendly DNS setup instructions.';

  const userPrompt =
    `Write step-by-step DNS setup instructions for a customer who bought their domain from *${reg}* ` +
    `and wants to point it at a Netlify-hosted site.\n\n` +
    `Customer's domain: ${domain}\n` +
    `Netlify host they need to point at: ${netlifyHost}\n` +
    `Netlify's load balancer IP: ${NETLIFY_LOAD_BALANCER_IP}\n\n` +
    `REQUIREMENTS:\n` +
    `1. 6-10 numbered steps, specific to ${reg}'s actual dashboard UI (menu names, tab labels).\n` +
    `2. Customer must add TWO records:\n` +
    `   - A record: Host/Name "@" (or blank), Value ${NETLIFY_LOAD_BALANCER_IP}, TTL lowest option\n` +
    `   - CNAME record: Host/Name "www", Value ${netlifyHost}, TTL lowest option\n` +
    `3. Tell them to DELETE any conflicting existing A or CNAME records on @ or www.\n` +
    `4. Mention DNS propagation takes 5-60 minutes.\n` +
    `5. If registrar is Cloudflare, WARN: set Proxy status to "DNS only" (grey cloud), NOT proxied (orange).\n` +
    `6. Use WhatsApp formatting: *bold* for button/menu names. No markdown headers.\n` +
    `7. Start with a short intro sentence. No preamble, no emoji-heavy padding.\n` +
    `8. If the registrar name looks obscure or unfamiliar, give generic steps using common DNS-editor terminology.\n` +
    `9. End with a single line: "Reply *help* if you get stuck and I'll walk you through it."\n\n` +
    `Return ONLY the instructions text, nothing else.`;

  try {
    const response = await generateResponse(
      systemPrompt,
      [{ role: 'user', content: userPrompt }],
      { userId, operation: 'dns_instructions' }
    );
    const text = String(response || '').trim();
    if (text.length < 80) {
      logger.warn(`[DNS-HELP] LLM returned suspiciously short output for ${reg}: "${text.slice(0, 60)}"`);
      return fallbackInstructions({ registrar: reg, domain, netlifyHost });
    }
    return text;
  } catch (err) {
    logger.error(`[DNS-HELP] LLM instructions failed for ${reg}: ${err.message}`);
    return fallbackInstructions({ registrar: reg, domain, netlifyHost });
  }
}

/**
 * Generic fallback used when the LLM call fails. Still actionable — just
 * less tailored to the specific registrar UI.
 */
function fallbackInstructions({ registrar, domain, netlifyHost }) {
  return (
    `Here's how to point *${domain}* at your new site. Exact menu names vary by ${registrar}, but the records are the same everywhere:\n\n` +
    `1. Sign in to *${registrar}* and open the DNS / Advanced DNS settings for *${domain}*.\n` +
    `2. Remove any existing A or CNAME records on "@" and "www" that point somewhere else.\n` +
    `3. Add an *A record*:\n` +
    `   • Host/Name: *@* (or leave blank)\n` +
    `   • Value/Points to: *${NETLIFY_LOAD_BALANCER_IP}*\n` +
    `   • TTL: lowest available (Automatic or 300)\n` +
    `4. Add a *CNAME record*:\n` +
    `   • Host/Name: *www*\n` +
    `   • Value/Points to: *${netlifyHost}*\n` +
    `   • TTL: lowest available\n` +
    `5. Save the changes.\n\n` +
    `DNS usually propagates in 5–60 minutes. Your site will be live at *${domain}* once it does.\n\n` +
    `Reply *help* if you get stuck and I'll walk you through it.`
  );
}

module.exports = {
  generateDnsInstructions,
  fallbackInstructions,
  registrarOptionsList,
  COMMON_REGISTRARS,
  NETLIFY_LOAD_BALANCER_IP,
};
