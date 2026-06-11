const { generateResponse } = require('../llm/provider');

const SYSTEM_PROMPT = `You classify a business's industry into exactly one category.
Reply with ONLY one of these words — nothing else:
salon, hvac, real_estate, portfolio, generic

salon       → beauty, hair, nails, spa, barber, facials, waxing, lashes, brows, makeup, esthetics
hvac        → heating, cooling, AC, boilers, plumbing, electrical, roofing, locksmith, pest control, appliance repair, water damage, tree service, garage door
real_estate → realtors, brokers, property listings, home sales, rental properties
portfolio   → an INDIVIDUAL showcasing their OWN work or career: freelancers, designers, developers, software engineers, photographers, writers, artists, consultants — including someone who says they "work in tech" / are "in the tech industry" / are a "tech professional" about themselves.
generic     → an organization/BUSINESS: restaurants, retail, gyms, schools, medical, AND tech COMPANIES / SaaS / software products / startups (a company, not one person).

Disambiguation when the answer is tech-related: first-person about a single person's own work or career ("I work in tech", "I'm a developer", "tech professional", "I want a portfolio") → portfolio. A company or product ("we build software", "our SaaS", "my tech startup", "software company") → generic. When a "User's own words" line is provided, weigh it heavily for this individual-vs-company call.`;

const VALID_KEYS = ['salon', 'hvac', 'real_estate', 'portfolio', 'generic'];

async function classifyIndustry(rawIndustry, opts = {}) {
  if (!rawIndustry) return 'generic';
  // Optional raw phrasing/context. The caller often passes a normalized label
  // (e.g. "Tech"), which loses the individual-vs-company signal; the raw words
  // let the model make the portfolio-vs-generic call correctly.
  const ctx = (opts && typeof opts.context === 'string' && opts.context.trim())
    ? `\n\nUser's own words: "${opts.context.trim().slice(0, 200)}"`
    : '';
  try {
    const result = await generateResponse(
      SYSTEM_PROMPT,
      [{ role: 'user', content: `${String(rawIndustry).slice(0, 200)}${ctx}` }],
      { operation: 'industry_classify' }
    );
    const key = result.trim().toLowerCase().replace(/[^a-z_]/g, '');
    return VALID_KEYS.includes(key) ? key : 'generic';
  } catch {
    return 'generic';
  }
}

module.exports = { classifyIndustry };
