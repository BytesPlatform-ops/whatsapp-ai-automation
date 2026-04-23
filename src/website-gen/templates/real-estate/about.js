const {
  esc, telHref, icon, agentHeadshot,
  wrapRealEstatePage, getRealEstateAgentSchema, buildTokens, DEFAULT_DESIGNATIONS,
} = require('./common');

function generateAboutPage(c) {
  const TOKENS = buildTokens(c);
  const phone = c.contactPhone || '';
  const tel = telHref(phone);
  const city = c.primaryCity || '';
  const years = c.yearsExperience || '15';
  const homesSold = c.homesSold || '200+';
  const volumeClosed = c.volumeClosed || '$50M';
  const reviewCount = c.reviewCount || '80+';
  const designations = (Array.isArray(c.designations) && c.designations.length ? c.designations : DEFAULT_DESIGNATIONS);
  const firstName = c.firstName || (c.businessName || '').split(' ')[0] || 'Your Agent';
  const foundedYear = c.foundedYear || (new Date().getFullYear() - (parseInt(years, 10) || 15));

  const hero = `
    <section class="page-hero">
      <div class="ctn">
        <p class="crumb"><a href="/">Home</a> / About</p>
        <h1 class="h1">About ${esc(c.businessName)}.</h1>
        <p class="body-lg">${esc(c.aboutTagline || `The ${city || 'local'} real estate agent families introduce by name.`)}</p>
      </div>
    </section>`;

  // Featured agent block — large editorial photo + story
  const featuredAgent = `
    <section class="sect">
      <div class="ctn">
        <div class="agent-intro">
          <div class="rv">${agentHeadshot(c.businessName, { size: 'lg', placeholderImage: c.agentPlaceholderImage })}</div>
          <div class="agent-intro-body rv">
            <span class="eyebrow">My Story</span>
            <h2 class="h2" style="margin-top:14px">${esc(c.aboutTitle || `Real estate that respects your time and your money.`)}</h2>
            <span class="bar-accent bar-accent-l"></span>
            <p class="body" style="margin-top:24px">${esc(c.aboutText || `I started in real estate in ${foundedYear} for a simple reason: my own first home purchase was unnecessarily painful. Since then I&apos;ve closed ${homesSold} homes for ${city || 'local'} families — and not one of those clients has felt the way I did at my own closing.`)}</p>
            <p class="body">${esc(c.aboutText2 || `I work the way I&apos;d want my own family worked with: zero pressure, complete transparency, and the kind of preparation that turns surprise inspections into non-events.`)}</p>
          </div>
        </div>
      </div>
    </section>`;

  // Stats strip
  const stats = `
    <section class="stats-strip">
      <div class="ctn">
        <div class="stat-cell rv"><span class="stat-num">${esc(volumeClosed)}</span><span class="stat-label">Closed ${new Date().getFullYear() - 1}</span></div>
        <div class="stat-cell rv"><span class="stat-num">${esc(homesSold)}</span><span class="stat-label">Homes Sold</span></div>
        <div class="stat-cell rv"><span class="stat-num">${esc(years)}+</span><span class="stat-label">Years Local</span></div>
        <div class="stat-cell rv"><span class="stat-num">${esc(reviewCount)}</span><span class="stat-label">5★ Reviews</span></div>
      </div>
    </section>`;

  // Designations & credentials
  const credentials = `
    <section class="sect">
      <div class="ctn">
        <div style="text-align:center;margin-bottom:36px" class="rv">
          <span class="eyebrow">Credentials</span>
          <h2 class="h2" style="margin-top:12px">Trained, certified, accountable.</h2>
          <span class="bar-accent"></span>
        </div>
        <div class="designations-line rv" style="justify-content:center;font-size:18px">
          ${designations.map((d, i) => `${i > 0 ? '<span class="des-sep"></span>' : ''}<span class="des-item">${esc(d)}</span>`).join('')}
        </div>
        ${c.licenseNumber ? `<p style="text-align:center;margin-top:24px;color:${TOKENS.muted};font-size:13px;letter-spacing:.06em">License #${esc(c.licenseNumber)}</p>` : ''}
      </div>
    </section>`;

  // Why choose us — 3 editorial pillars
  const whyPillars = (c.whyChooseUs && c.whyChooseUs.length >= 3 ? c.whyChooseUs.slice(0, 3) : [
    { title: 'Local intelligence.', description: `I&apos;ve walked nearly every block in ${city || 'this area'}. I know which streets flood, which schools are about to redistrict, and which builders cut corners.` },
    { title: 'Honest counsel.', description: 'I&apos;ll tell you when a home is overpriced. I&apos;ll tell you when to wait. I&apos;ll tell you when to walk. My commission is downstream of your right decision.' },
    { title: 'Calm closings.', description: 'Inspections, appraisals, lenders, attorneys — I keep the timeline tight and the surprises minimal. Your closing day should feel like a celebration, not a survival exercise.' },
  ]);

  const whyChoose = `
    <section class="sect sect-cream">
      <div class="ctn">
        <div style="text-align:center;margin-bottom:48px" class="rv">
          <span class="eyebrow">How I Work</span>
          <h2 class="h2" style="margin-top:12px">What you&apos;ll get every time.</h2>
          <span class="bar-accent"></span>
        </div>
        <div style="display:grid;gap:36px;grid-template-columns:1fr" class="why-pillars">
          ${whyPillars.map((p, i) => `
            <div class="rv" style="display:flex;gap:28px;align-items:flex-start;padding:24px 0;border-top:1px solid ${TOKENS.beige}">
              <div style="font-family:'Cormorant Garamond',serif;font-size:48px;font-weight:600;color:${TOKENS.gold};line-height:1;letter-spacing:-.02em;min-width:80px">${String(i + 1).padStart(2, '0')}</div>
              <div>
                <h3 class="h3" style="margin-bottom:10px">${esc(p.title)}</h3>
                <p class="body" style="max-width:640px">${esc(p.description)}</p>
              </div>
            </div>`).join('')}
        </div>
      </div>
    </section>
    <style>
      @media(min-width:900px){.why-pillars{grid-template-columns:1fr!important}}
    </style>`;

  // Brokerage card
  const brokerage = c.brokerageName ? `
    <section class="sect">
      <div class="ctn">
        <div class="rv" style="max-width:640px;margin:0 auto;text-align:center;padding:40px 32px;border:1px solid ${TOKENS.beige};background:#fff">
          <span class="eyebrow">Brokered By</span>
          <p style="font-family:'Cormorant Garamond',serif;font-size:36px;font-weight:600;color:${TOKENS.navy};margin-top:14px;letter-spacing:-.005em">${esc(c.brokerageName)}</p>
          ${c.licenseNumber ? `<p style="margin-top:8px;color:${TOKENS.muted};font-size:13px;letter-spacing:.06em">License #${esc(c.licenseNumber)}</p>` : ''}
        </div>
      </div>
    </section>` : '';

  // CTA
  const cta = `
    <section class="valuation-banner">
      <div class="ctn">
        <div class="rv">
          <span class="eyebrow">Let&apos;s Talk</span>
          <h2 class="h2">${esc(c.ctaTitle || 'Whether you&apos;re a year out or ready this weekend — I&apos;m here.')}</h2>
          <p class="body-lg">A 20-minute call. No pressure. We figure out if I&apos;m the right fit, and if I&apos;m not, I&apos;ll point you to someone who is.</p>
          <div style="margin-top:30px;display:flex;flex-wrap:wrap;gap:14px">
            <a href="/contact" class="btn btn-gold">Schedule a Call</a>
            ${phone ? `<a href="tel:${esc(tel)}" class="btn btn-outline-white">${esc(phone)}</a>` : ''}
          </div>
        </div>
        <div class="valuation-card" style="text-align:center">
          <div style="font-family:'Cormorant Garamond',serif;font-style:italic;font-size:24px;color:${TOKENS.warmWhite};font-weight:500;line-height:1.4">"${esc((c.testimonials && c.testimonials[0] && c.testimonials[0].quote) || 'Three offers in, we finally found our agent. Worth every minute we wasted before.')}"</div>
          <div style="margin-top:18px;color:${TOKENS.gold};font-family:'Inter',sans-serif;font-size:12px;letter-spacing:.1em">— RECENT CLIENT</div>
        </div>
      </div>
    </section>`;

  // ─── Process Timeline — 4-step buying/selling journey ───────────────────
  const steps = [
    { title: 'Consult', body: 'A 20-minute call to understand your timeline, your budget, and the home you actually want — not the one a search engine guesses you want.' },
    { title: 'Tour', body: 'Curated showings of properties that fit. We skip the noise; you only see homes worth your weekend.' },
    { title: 'Offer', body: 'Strategic offer crafted around the seller\u2019s motivations, not just the asking price. Every contingency explained.' },
    { title: 'Close', body: 'Inspections, appraisal, lender, attorney — all coordinated. Your closing day is a celebration, not a survival exercise.' },
  ];

  const processTimeline = `
    <section class="sect" style="background:${TOKENS.warmWhite}">
      <div class="ctn">
        <div style="text-align:center;margin-bottom:20px" class="rv">
          <span class="eyebrow">How It Works</span>
          <h2 class="h2" style="margin-top:12px">A clear path from hello to keys.</h2>
          <span class="bar-accent"></span>
        </div>
        <div class="process-timeline">
          ${steps.map((s, i) => `
            <div class="process-step rv">
              <div class="process-num">${String(i + 1).padStart(2, '0')}</div>
              <h3>${esc(s.title)}</h3>
              <p>${esc(s.body)}</p>
            </div>`).join('')}
        </div>
      </div>
    </section>`;

  const body = hero + featuredAgent + stats + credentials + whyChoose + processTimeline + brokerage + cta;

  return wrapRealEstatePage(c, '/about', body, {
    title: `About ${c.businessName}${city ? ` — Real Estate ${city}` : ''}`,
    description: `${c.businessName}: ${years}+ years selling real estate in ${city || 'the area'}. ${homesSold} homes sold, ${volumeClosed} closed last year.`,
    schemas: [getRealEstateAgentSchema(c)],
  });
}

module.exports = { generateAboutPage };
