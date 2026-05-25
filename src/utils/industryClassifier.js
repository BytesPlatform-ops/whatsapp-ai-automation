const { generateResponse } = require('../llm/provider');

const SYSTEM_PROMPT = `You classify a business's industry into exactly one category.
Reply with ONLY one of these words — nothing else:
salon, hvac, real_estate, portfolio, generic

salon       → beauty, hair, nails, spa, barber, facials, waxing, lashes, brows, makeup, esthetics
hvac        → heating, cooling, AC, boilers, plumbing, electrical, roofing, locksmith, pest control, appliance repair, water damage, tree service, garage door
real_estate → realtors, brokers, property listings, home sales, rental properties
portfolio   → freelancers, designers, developers, photographers, writers, artists, consultants
generic     → everything else (restaurants, retail, software, gyms, schools, medical, etc.)`;

const VALID_KEYS = ['salon', 'hvac', 'real_estate', 'portfolio', 'generic'];

async function classifyIndustry(rawIndustry) {
  if (!rawIndustry) return 'generic';
  try {
    const result = await generateResponse(
      SYSTEM_PROMPT,
      [{ role: 'user', content: String(rawIndustry).slice(0, 200) }],
      { operation: 'industry_classify' }
    );
    const key = result.trim().toLowerCase().replace(/[^a-z_]/g, '');
    return VALID_KEYS.includes(key) ? key : 'generic';
  } catch {
    return 'generic';
  }
}

module.exports = { classifyIndustry };
