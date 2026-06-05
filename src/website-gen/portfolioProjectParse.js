// Shared portfolio-project parser.
//
// Turns a freelancer's free-text reply into structured project entries. Used
// by BOTH intake paths so they behave identically:
//   - chat: src/conversation/handlers/webDev.js (WEB_COLLECT_PROJECTS_DETAILS)
//   - Meta Flow form: src/flows/intake.js (the portfolio f2 "projects" textarea)
//
// Multi-project critical: a single message often carries MULTIPLE projects
// ("pixiebot.co\nbytesplatform.com" = 2 projects). The LLM splits per URL /
// per title. Single-project messages still come back as a 1-element array.
// Returns [] when the input clearly isn't project content (caller re-asks).
// Each entry has at least a `title`.

const { logger } = require('../utils/logger');
const { generateResponse } = require('../llm/provider');

async function parseProjectText(raw, userId) {
  const text = String(raw || '').trim();
  if (!text) return [];
  const systemPrompt =
    `Extract portfolio-project entries from a freelancer's free-text reply. The reply may contain ONE project OR MULTIPLE projects — split appropriately and return an ARRAY. Return ONLY JSON.\n\n` +
    `Schema: {"projects": [{"title": <string, max 80 chars>, "description": <string 1-2 sentences, max 200 chars or null>, "role": <string max 60 chars or null>, "year": <string max 8 chars or null>, "link": <full https URL or null — accept bare domains and prepend https:// yourself>, "tools": [<string max 24 chars>, ...] or null}, ...]}\n\n` +
    `Multi-project signals — split into separate entries when:\n` +
    `- Multiple URLs / domains on separate lines or separated by commas / spaces ("pixiebot.co\\nbytesplatform.com\\nbytesplatform.info" → 3 projects, one per URL).\n` +
    `- Multiple titles separated by " — " / commas / line breaks / "and" / "&" / numbered lists.\n` +
    `- Multiple year-tagged items in one message.\n` +
    `When splitting, each project gets its own title (derive from the URL hostname if no explicit title — "pixiebot.co" → "Pixiebot", "github.com/foo/bar" → "Bar"). Don't fabricate descriptions / roles / years if not stated — leave them null.\n\n` +
    `Single-project signals — keep as one entry when the message describes ONE project even if long ("BrandX rebrand 2024 — Lead Designer — took the visual identity from corporate to bold. behance.net/brandx"). Multiple sentences about ONE project ≠ multiple projects.\n\n` +
    `Per-project rules:\n` +
    `- title: required. For URL-only projects, derive from hostname. If genuinely no title and no URL, drop the entry.\n` +
    `- description: short blurb. Pull from user's prose. Null if not stated — don't invent.\n` +
    `- role: user's role. Null if not stated.\n` +
    `- year: 4-digit year if explicitly stated. Null otherwise.\n` +
    `- link: ANY URL — bare-domain accepted, output WITH https:// prepended. Null if no URL.\n` +
    `- tools: array of tools/tech mentioned. Null if not stated.\n` +
    `- ANY language is OK; translate to English but keep proper nouns and links verbatim.\n` +
    `- Never invent values.\n\n` +
    `If no usable project content at all, return {"projects": []}.`;
  try {
    const response = await generateResponse(
      systemPrompt,
      [{ role: 'user', content: text.slice(0, 1200) }],
      { userId, operation: 'portfolio_project_parse', timeoutMs: 15_000 }
    );
    const m = String(response || '').match(/\{[\s\S]*\}/);
    if (!m) return [];
    const parsed = JSON.parse(m[0]);
    const arr = Array.isArray(parsed.projects) ? parsed.projects : [];
    const out = [];
    for (const entry of arr) {
      if (!entry || typeof entry !== 'object') continue;
      const item = {};
      if (typeof entry.title === 'string' && entry.title.trim().length >= 2 && entry.title.trim().length <= 80) {
        item.title = entry.title.trim();
      } else {
        continue; // drop entries without a usable title
      }
      if (typeof entry.description === 'string' && entry.description.trim().length >= 5 && entry.description.trim().length <= 220) {
        item.description = entry.description.trim();
      }
      if (typeof entry.role === 'string' && entry.role.trim().length >= 2 && entry.role.trim().length <= 60) {
        item.role = entry.role.trim();
      }
      if (typeof entry.year === 'string' && /^\d{4}$/.test(entry.year.trim())) {
        item.year = entry.year.trim();
      }
      if (typeof entry.link === 'string') {
        const linkRaw = entry.link.trim();
        if (/^https?:\/\//i.test(linkRaw) && linkRaw.length <= 200) item.link = linkRaw;
      }
      if (Array.isArray(entry.tools)) {
        const cleaned = entry.tools
          .map((t) => (typeof t === 'string' ? t.trim() : ''))
          .filter((t) => t && t.length <= 24)
          .slice(0, 8);
        if (cleaned.length) item.tools = cleaned;
      }
      out.push(item);
    }
    return out;
  } catch (err) {
    logger.warn(`[PORTFOLIO-PROJECT-PARSE] LLM threw: ${err.message}`);
    return [];
  }
}

module.exports = { parseProjectText };
