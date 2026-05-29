// Dynamic phrasing — takes a canonical English template and returns a
// freshly-worded version of it via the LLM, matching the user's language
// and tone. Replaces hardcoded wizard / ack strings that previously read
// as "robot script" because every user saw byte-identical copy.
//
// One LLM call per send. ~200-400ms latency added; small token cost.
// Falls back to the canonical English string if the LLM call fails, so a
// flaky provider never breaks the conversation.
//
// Difference from `utils/localizer.js` `localize()`:
//   - localize: TRANSLATE only — English is returned unchanged.
//   - dynamicPhrase: REPHRASE always (even English), and translate too
//     if the user is in another language. The whole point is to vary
//     phrasing so the bot stops sounding scripted.

const { generateResponse } = require('../llm/provider');
const { resolveLanguage } = require('./localizer');
const { logger } = require('./logger');

/**
 * Rephrase a canonical message so it feels natural and varied each time.
 *
 * @param {string} canonical - English source text. May contain *bold*,
 *   URLs, [TAGS], and inline placeholder values (those must be preserved
 *   verbatim).
 * @param {object} user - User row (used for language detection + caching).
 * @param {string} latestUserMessage - Most recent message text from the
 *   user this turn — fed as detection context.
 * @param {object} [opts]
 * @param {string} [opts.intent] - One-line summary of what the message
 *   needs to accomplish (e.g. "ask for the business name"). Helps the LLM
 *   stay on-task instead of going off-script.
 * @param {string[]} [opts.recent] - Up to 4 recent assistant messages so
 *   the LLM knows what phrasings it already used and avoids repeats.
 * @returns {Promise<string>} The rephrased (and possibly translated) text.
 */
async function dynamicPhrase(canonical, user, latestUserMessage, opts = {}) {
  if (!canonical) return canonical;

  const lang = await resolveLanguage(user, latestUserMessage);
  const targetLang = (!lang || lang === 'english') ? 'English' : lang;
  const isRoman = typeof lang === 'string' && lang.startsWith('roman-');

  const intentLine = opts.intent ? `\nIntent of this message: ${opts.intent}` : '';
  const recentBlock = (Array.isArray(opts.recent) && opts.recent.length > 0)
    ? `\nPhrasings you have already used in this conversation (DO NOT repeat their wording — pick something different):\n${opts.recent.slice(-4).map((m) => `  - ${String(m).slice(0, 200)}`).join('\n')}`
    : '';

  const sysPrompt = `You are rephrasing a single message from a WhatsApp sales bot named Pixie. The source message below is a TEMPLATE — your job is to rewrite it in your own words so it feels human and never identical to last time. Make it sound natural, casual, and human — like a person typing on their phone, not a script.

**The output MUST be different from the source phrasing.** Do not return the input verbatim. Reorder beats, switch synonyms, drop filler words, shift formality up or down — but always end with the same effective ask the source has.

Rules:
- Reply in ${targetLang}.${isRoman ? ' Use Latin/Roman script (NOT the native alphabet).' : ''}
- Preserve every URL, *bold marker*, _italic marker_, backtick, emoji, phone number, email, @handle, and any [TAGS_IN_BRACKETS] exactly as-is.
- Preserve every literal value the source uses (real user-supplied data: their business name, their prices, their service names, their numbers) — translate the surrounding words only.
- EXCEPTION — command keywords: short instruction words the user is invited to type back (e.g. *skip*, *default*, *no*, *yes*, *new*, *own*, *cancel*) MUST be translated into ${targetLang} too (keep the bold markers / quotes around them). The bot understands the reply in any language, so a ${targetLang} speaker should see the keyword in their own language — never a leftover English word like "skip" or "default" inside a ${targetLang} sentence. This applies ONLY to these short throwaway command words, never to business names, prices, URLs, or other real values.
- EXCEPTION for example blocks: when the source contains an example introduced by "e.g.", "ex.:", "example:", "(e.g.", or "(ex.", the example contents are placeholders, NOT real data. Localize them too — service names should become equivalent service names in ${targetLang}, currency formatting should match the locale, and the example should read like a natural example a ${targetLang} speaker would write. (E.g. for Portuguese, "Haircut 30min $40, Color 90min $120, Manicure 45min $30" should become "Corte 30min R$40, Coloração 90min R$120, Manicure 45min R$30".)
- Keep the meaning, the formatting structure (line breaks, bullets), and any explicit instruction the user must respond to. Don't add information the source doesn't have.
- Vary the wording from what's listed under "already used" so two replies in a row never read the same.
- No preambles, no quotes around your answer, no commentary. Output ONLY the message text.
- One short line per beat. WhatsApp = brief.${isRoman ? '\n- For gendered languages, commit to one form (masculine / neutral by default). Never use slash hedges like "karunga/karungi".' : ''}${intentLine}${recentBlock}`;

  try {
    const out = await generateResponse(
      sysPrompt,
      [{ role: 'user', content: canonical }],
      { userId: user?.id, operation: 'dynamic_phrase' }
    );
    const rephrased = String(out || '').trim();
    return rephrased || canonical;
  } catch (err) {
    logger.warn(`[DYNAMIC_PHRASE] Rephrase failed (${err.message}) — falling back to canonical`);
    return canonical;
  }
}

module.exports = { dynamicPhrase };
