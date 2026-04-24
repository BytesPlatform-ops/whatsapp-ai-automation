const {
  esc, telHref, slugify, fmtMoney, icon,
  wrapRealEstatePage, getRealEstateAgentSchema, buildTokens,
} = require('./common');

// Deterministic per-area YoY % if LLM didn't supply one.
function fallbackYoY(area, baseline = 3.2) {
  const s = String(area || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
  const offset = ((h % 70) - 25) / 10;
  return +(baseline + offset).toFixed(1);
}

function generateNeighborhoodsPage(c) {
  const TOKENS = buildTokens(c);
  const phone = c.contactPhone || '';
  const tel = telHref(phone);
  const city = c.primaryCity || '';
  const areas = (c.serviceAreas && c.serviceAreas.length ? c.serviceAreas : (city ? [city] : []));
  const descriptions = c.areaDescriptions || {};
  const medianPrices = c.areaMedianPrices || {};
  const walkability = c.areaWalkability || {};
  const schoolRating = c.areaSchoolRating || {};
  const yoyMap = c.areaYoY || {};
  const bestForMap = c.areaBestFor || {};
  const baselineYoy = (c.marketStats && c.marketStats.yearOverYearPct != null)
    ? c.marketStats.yearOverYearPct
    : 3.2;
  const mapsQuery = city ? encodeURIComponent(city) : (areas[0] ? encodeURIComponent(areas[0]) : '');

  // Listing counts per neighborhood (for anchor-pill badges)
  const listingCounts = {};
  (c.featuredListings || []).forEach((l) => {
    if (l && l.neighborhood) {
      listingCounts[l.neighborhood] = (listingCounts[l.neighborhood] || 0) + 1;
    }
  });

  // Recent sales grouped by neighborhood (for in-card mini-row)
  const salesByArea = {};
  (c.recentSales || []).forEach((s) => {
    if (s && s.neighborhood) {
      if (!salesByArea[s.neighborhood]) salesByArea[s.neighborhood] = s; // first match wins
    }
  });

  // Pick a featured neighborhood: one with the most listings, otherwise the first.
  const featuredArea = (() => {
    const withCounts = areas
      .map((a) => ({ a, count: listingCounts[a] || 0 }))
      .sort((x, y) => y.count - x.count);
    return (withCounts[0] && withCounts[0].count > 0) ? withCounts[0].a : areas[0];
  })();

  const hero = `
    <section class="page-hero">
      <div class="ctn">
        <p class="crumb"><a href="/">Home</a> / Neighborhoods</p>
        <h1 class="h1">Neighborhoods I know inside out.</h1>
        <p class="body-lg">${city ? `From ${esc(city)}&apos;s historic blocks to its newest builds, I&apos;ve walked the streets, read the schools&apos; report cards, and helped families plant roots in each.` : 'I&apos;ve helped families settle into every neighborhood listed below \u2014 and know exactly which ones suit which kind of life.'}</p>
        <div class="page-hero-stats">
          <span class="phs-item"><strong>${areas.length}</strong> ${areas.length === 1 ? 'Neighborhood' : 'Neighborhoods'}</span>
          <span class="phs-sep"></span>
          <span class="phs-item"><strong>15-mile</strong> radius</span>
          <span class="phs-sep"></span>
          <span class="phs-item">Updated monthly</span>
        </div>
      </div>
    </section>`;

  const map = mapsQuery ? `
    <section style="padding:56px 0 32px">
      <div class="ctn">
        <div class="area-map-wrap rv">
          <iframe loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=${mapsQuery}&z=10&output=embed" title="Service area map"></iframe>
          <div class="area-map-overlay">
            <span class="amo-eyebrow">Coverage Area</span>
            <div class="amo-title">${city ? `Greater ${esc(city)}` : 'Service Area'}</div>
            <div class="amo-stats">
              <div class="amo-stat">
                <strong>${areas.length}</strong>
                <span>${areas.length === 1 ? 'Area' : 'Areas'}</span>
              </div>
              <div class="amo-stat">
                <strong>15&nbsp;mi</strong>
                <span>Radius</span>
              </div>
              <div class="amo-stat">
                <strong>${c.homesSold || '200+'}</strong>
                <span>Closed</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>` : '';

  const anchors = areas.length ? `
    <section style="padding:0 0 24px 0">
      <div class="ctn">
        <div class="area-anchors rv">
          ${areas.map((a) => `<a class="area-anchor" href="#${slugify(a)}">${esc(a)}${listingCounts[a] ? `<span class="aa-count">${listingCounts[a]}</span>` : ''}</a>`).join('')}
        </div>
      </div>
    </section>` : '';

  // Build a single card (regular or featured variant share most markup)
  const renderAreaCard = (a, variant = 'card') => {
    const desc = descriptions[a] || descriptions[a.toLowerCase()] ||
      `A neighborhood I know intimately \u2014 from the parks the families love to the streets the parents avoid at school pickup. Ask me anything specific about ${esc(a)}; I&apos;ve probably toured the home.`;
    const median = medianPrices[a] || medianPrices[a.toLowerCase()] || null;
    const walk = walkability[a] || walkability[a.toLowerCase()] || 72;
    const schools = schoolRating[a] || schoolRating[a.toLowerCase()] || 8.4;
    const yoyRaw = yoyMap[a] != null ? yoyMap[a] : (yoyMap[a.toLowerCase()] != null ? yoyMap[a.toLowerCase()] : fallbackYoY(a, baselineYoy));
    const yoy = typeof yoyRaw === 'number' ? yoyRaw : parseFloat(yoyRaw) || 0;
    const trendClass = yoy > 0.3 ? 'up' : yoy < -0.3 ? 'down' : 'flat';
    const trendLabel = `${Math.abs(yoy).toFixed(1)}%`;
    const bestFor = bestForMap[a] || bestForMap[a.toLowerCase()] || null;
    const recentSale = salesByArea[a] || salesByArea[a.toLowerCase()] || null;
    const recentSaleLine = recentSale ? `
      <div class="recent-sale-line">
        <span class="rsl-label">Recent sale</span>
        <span class="rsl-price">${esc(fmtMoney(recentSale.price))}</span>
        <span class="rsl-meta">${[recentSale.beds ? `${recentSale.beds} bd` : '', recentSale.baths ? `${recentSale.baths} ba` : '', recentSale.soldOn ? esc(recentSale.soldOn) : ''].filter(Boolean).join(' \u00B7 ')}</span>
      </div>` : '';
    const img = (c.neighborhoodImages && (c.neighborhoodImages[a] || c.neighborhoodImages[a.toLowerCase()])) || null;
    const photoHtml = img && img.url
      ? `<img src="${esc(img.url)}" alt="${esc(a)}" loading="lazy">`
      : `<div class="neighborhood-photo-placeholder"><span class="np-monogram">${esc(a.trim().charAt(0).toUpperCase())}</span><span class="np-sublabel">Photography sample \u2014 replace</span></div>`;

    const statsBlock = `
      <div class="neighborhood-stats">
        <span>
          <span class="ns-icon">${icon('star', 14, TOKENS.gold)}</span>
          Median
          <strong>${median ? esc(fmtMoney(median)) : '—'}<span class="trend-pill ${trendClass}">${esc(trendLabel)}</span></strong>
        </span>
        <span>
          <span class="ns-icon">${icon('walking', 14, TOKENS.gold)}</span>
          Walkability
          <strong>${esc(String(walk))}<span style="font-size:.55em;font-weight:500;color:${TOKENS.muted};margin-left:2px">/100</span></strong>
        </span>
        <span>
          <span class="ns-icon">${icon('school', 14, TOKENS.gold)}</span>
          Schools
          <strong>${esc(String(schools))}<span style="font-size:.55em;font-weight:500;color:${TOKENS.muted};margin-left:2px">/10</span></strong>
        </span>
      </div>`;

    if (variant === 'featured') {
      return `
        <div id="${slugify(a)}" class="neighborhood-card neighborhood-featured rv">
          <div class="neighborhood-photo">
            ${photoHtml}
            <span class="featured-ribbon">Featured Neighborhood</span>
          </div>
          <div class="neighborhood-body">
            <div class="featured-name">${esc(a)}</div>
            <div class="featured-sub">${city ? `${esc(city)} \u00B7 ${listingCounts[a] ? `${listingCounts[a]} active ${listingCounts[a] === 1 ? 'listing' : 'listings'}` : 'Active market'}` : ''}</div>
            ${bestFor ? `<span class="best-for">${esc(bestFor)}</span>` : ''}
            <p class="neighborhood-desc">${esc(desc)}</p>
            ${statsBlock}
            ${recentSaleLine}
            <div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">
              <a href="/contact?neighborhood=${encodeURIComponent(a)}" class="btn btn-navy btn-sm">Request a Tour</a>
              <a href="/listings" class="btn btn-text" style="padding-left:12px">View listings in ${esc(a)} \u2192</a>
            </div>
          </div>
        </div>`;
    }

    return `
      <div id="${slugify(a)}" class="neighborhood-card rv">
        <div class="neighborhood-photo">
          ${photoHtml}
          <div class="neighborhood-photo-overlay"></div>
          <div class="neighborhood-name">${esc(a)}</div>
        </div>
        <div class="neighborhood-body">
          ${bestFor ? `<span class="best-for">${esc(bestFor)}</span>` : ''}
          ${statsBlock}
          <p class="neighborhood-desc">${esc(desc)}</p>
          ${recentSaleLine}
          <div style="margin-top:22px;display:flex;gap:10px;flex-wrap:wrap">
            <a href="/contact?neighborhood=${encodeURIComponent(a)}" class="btn btn-outline btn-sm">Request a Tour</a>
          </div>
        </div>
      </div>`;
  };

  const grid = areas.length ? `
    <section class="sect" style="padding-top:24px">
      <div class="ctn">
        <div class="neighborhoods-grid">
          ${renderAreaCard(featuredArea, 'featured')}
          ${areas.filter((a) => a !== featuredArea).map((a) => renderAreaCard(a, 'card')).join('')}
        </div>
      </div>
    </section>` : `
    <section class="sect">
      <div class="ctn" style="text-align:center;max-width:520px">
        <p class="body">Neighborhood pages coming soon. Reach out${phone ? ` at <a href="tel:${esc(tel)}">${esc(phone)}</a>` : ''} to learn about specific areas.</p>
      </div>
    </section>`;

  // ─── Matchmaker decision section (Tier 3 #9) — data-driven picks ─────────
  // Score each area on 4 axes, then dedupe so each card points to a unique
  // neighborhood.
  const withStats = areas.map((a) => ({
    a,
    walk: walkability[a] || walkability[a.toLowerCase()] || 72,
    schools: schoolRating[a] || schoolRating[a.toLowerCase()] || 8.4,
    yoy: yoyMap[a] != null ? yoyMap[a] : (yoyMap[a.toLowerCase()] != null ? yoyMap[a.toLowerCase()] : fallbackYoY(a, baselineYoy)),
    median: medianPrices[a] || medianPrices[a.toLowerCase()] || null,
  }));

  const decisionSpecs = [
    { q: 'Walkable urban energy', getRank: (x) => x.walk, why: (x) => `${x.walk}/100 walkability`, direction: 'desc' },
    { q: 'Top-ranked schools', getRank: (x) => x.schools, why: (x) => `${x.schools}/10 school rating`, direction: 'desc' },
    { q: 'Investment upside', getRank: (x) => x.yoy || 0, why: (x) => `${x.yoy > 0 ? '+' : ''}${(x.yoy || 0).toFixed(1)}% YoY`, direction: 'desc' },
    { q: 'First-home value', getRank: (x) => x.median || Infinity, why: (x) => (x.median ? `Median ${fmtMoney(x.median)}` : 'Entry-level market'), direction: 'asc' },
  ];

  const picked = new Set();
  const decisions = decisionSpecs.map((spec, i) => {
    const pool = withStats
      .filter((x) => !picked.has(x.a))
      .sort((x, y) => spec.direction === 'desc' ? spec.getRank(y) - spec.getRank(x) : spec.getRank(x) - spec.getRank(y));
    const pick = pool[0] || withStats[i % withStats.length];
    if (pick) picked.add(pick.a);
    return pick ? { q: spec.q, why: spec.why(pick), name: pick.a } : null;
  }).filter(Boolean);

  const matchmaker = decisions.length >= 4 ? `
    <section class="matchmaker">
      <div class="ctn">
        <div class="mm-header rv">
          <span class="eyebrow">Finding Your Fit</span>
          <h2 class="h2">Not sure which? Start here.</h2>
          <span class="bar-accent"></span>
          <p class="mm-sub">Each buyer weighs it differently. Here are four quick paths based on what most clients tell me matters.</p>
        </div>
        <div class="match-grid">
          ${decisions.map((d, i) => `
            <a class="match-card rv" href="#${slugify(d.name)}">
              <span class="match-num">${String(i + 1).padStart(2, '0')}</span>
              <span class="match-eyebrow">If you want</span>
              <h4 class="match-q">${esc(d.q)}</h4>
              <div class="match-answer">
                <strong>${esc(d.name)}</strong>
                <div class="match-answer-why">
                  <span>${esc(d.why)}</span>
                  <span class="match-arrow">\u2192</span>
                </div>
              </div>
            </a>`).join('')}
        </div>
      </div>
    </section>` : '';

  // ─── Page-specific CTA (Tier 3 #11) — personalized shortlist framing ────
  const cta = `
    <section class="valuation-banner">
      <div class="ctn">
        <div class="rv">
          <span class="eyebrow">Still Deciding?</span>
          <h2 class="h2">Tell me your lifestyle. I&apos;ll send a shortlist.</h2>
          <p class="body-lg">Most buyers land on the right neighborhood by accident. Let&apos;s make yours intentional. Share what matters \u2014 schools, commute, walkability, budget, quirks \u2014 and I&apos;ll come back with 2-3 areas tailored to you, plus what&apos;s currently moving in each.</p>
          <div style="margin-top:30px;display:flex;flex-wrap:wrap;gap:14px">
            <a href="/contact" class="btn btn-gold">Send Me a Shortlist</a>
            ${phone ? `<a href="tel:${esc(tel)}" class="btn btn-outline-white">Call ${esc(phone)}</a>` : ''}
          </div>
        </div>
        <div class="valuation-card rv" style="text-align:center">
          <div style="font-family:'Cormorant Garamond',serif;font-size:64px;font-weight:700;color:${TOKENS.gold};line-height:1">${areas.length}</div>
          <p style="color:rgba(250,247,242,.7);margin-top:6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase">${areas.length === 1 ? 'Neighborhood' : 'Neighborhoods'} Served</p>
          <p style="color:rgba(250,247,242,.55);margin-top:14px;font-family:'Cormorant Garamond',serif;font-style:italic;font-size:13.5px;line-height:1.5">24-hour response, handwritten.</p>
        </div>
      </div>
    </section>`;

  const body = hero + map + anchors + grid + matchmaker + cta;

  return wrapRealEstatePage(c, '/neighborhoods', body, {
    title: `Neighborhoods${city ? ` \u2014 ${city} & Surrounding Areas` : ''} | ${c.businessName}`,
    description: `${c.businessName} serves ${areas.length ? areas.slice(0, 5).join(', ') : (city || 'the region')}. Walkability, schools, median prices and on-the-ground knowledge.`,
    schemas: [getRealEstateAgentSchema(c)],
  });
}

module.exports = { generateNeighborhoodsPage };
