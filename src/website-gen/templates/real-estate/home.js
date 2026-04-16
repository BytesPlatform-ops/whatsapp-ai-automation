const {
  esc, telHref, slugify, fmtMoney, icon, iconFilled, googleGlyph, agentHeadshot,
  wrapRealEstatePage, getRealEstateAgentSchema, netlifyFormAttrs, netlifyHiddenFields,
  TOKENS, DEFAULT_DESIGNATIONS, DEFAULT_LISTINGS,
} = require('./common');
const { computeHeroPaletteFromConfig } = require('../../heroPalette');

function statusClass(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('just listed') || s.includes('new')) return 's-just-listed';
  if (s.includes('pending')) return 's-pending';
  if (s.includes('sold')) return 's-sold';
  return '';
}

function generateHomePage(c) {
  const phone = c.contactPhone || '';
  const tel = telHref(phone);
  const city = c.primaryCity || '';
  const rating = c.googleRating || '4.9';
  const reviewCount = c.reviewCount || '80+';
  const homesSold = c.homesSold || '200+';
  const volumeClosed = c.volumeClosed || '$50M';
  const years = c.yearsExperience || '15';
  const designations = (Array.isArray(c.designations) && c.designations.length ? c.designations : DEFAULT_DESIGNATIONS).slice(0, 4);
  const listings = (Array.isArray(c.featuredListings) && c.featuredListings.length ? c.featuredListings : DEFAULT_LISTINGS).slice(0, 3);
  const neighborhoods = (c.serviceAreas || []).slice(0, 6);
  const hasHeroImg = !!(c.heroImage && c.heroImage.url);

  // ─── Hero ─────────────────────────────────────────────────────────────────
  const hero = `
    <section class="hero">
      <div class="hero-bg">
        ${hasHeroImg ? `<img src="${esc(c.heroImage.url)}" alt="${esc(city || c.businessName)}" loading="eager">` : ''}
      </div>
      <div class="hero-overlay"></div>
      <div class="ctn">
        <div class="hero-content rv">
          <span class="eyebrow" style="color:${TOKENS.gold}">${esc(c.brokerageName || 'Real Estate Expert')}${city ? ` &middot; ${esc(city)}` : ''}</span>
          <h1>${esc(c.heroHeadline || `Finding the ${city || 'Right'} Home, One Family at a Time.`)}</h1>
          <p class="hero-sub">${esc(c.heroSubtitle || `${years}+ years helping ${city ? `${city}-area` : 'local'} families buy and sell with confidence. Let&apos;s find your next chapter together.`)}</p>
          <div class="hero-cta-row">
            <a href="/listings" class="btn btn-gold btn-lg">Browse Listings</a>
            <a href="/contact" class="btn btn-outline-white btn-lg">Schedule a Call</a>
          </div>
        </div>
      </div>
    </section>`;

  // ─── Stats strip ─────────────────────────────────────────────────────────
  const statCell = (value, label) => `
    <div class="stat-cell rv">
      <span class="stat-ornament"></span>
      <div class="stat-num">${value}</div>
      <span class="stat-label">${label}</span>
    </div>`;

  const statsStrip = `
    <section class="stats-strip">
      <div class="ctn">
        ${statCell(esc(volumeClosed), `Closed ${new Date().getFullYear() - 1}`)}
        ${statCell(esc(homesSold), 'Homes Sold')}
        ${statCell(`${esc(rating)}<span style="font-size:.55em;color:${TOKENS.gold};margin-left:4px">★</span>`, `${esc(reviewCount)} Reviews`)}
        ${statCell(`${esc(years)}+`, 'Years Local')}
      </div>
    </section>`;

  // ─── Agent intro split ───────────────────────────────────────────────────
  const agentIntro = `
    <section class="sect">
      <div class="ctn">
        <div class="agent-intro">
          <div class="rv">${agentHeadshot(c.businessName, { placeholderImage: c.agentPlaceholderImage })}</div>
          <div class="agent-intro-body rv">
            <span class="eyebrow">Meet ${esc(c.firstName || (c.businessName || '').split(' ')[0] || 'Your Agent')}</span>
            <h2 class="h2" style="margin-top:14px">${esc(c.aboutTitle || `A trusted partner for life&apos;s biggest move.`)}</h2>
            <span class="bar-accent bar-accent-l"></span>
            <p class="body">${esc(c.aboutText || `For ${years}+ years I&apos;ve helped families across ${city || 'the area'} buy and sell with clarity, candor, and care. I treat every transaction as if I were the one signing — because the right move is rarely the fastest one.`)}</p>
            ${c.aboutText2 ? `<p class="body">${esc(c.aboutText2)}</p>` : `<p class="body">When I&apos;m not at a closing table or open house, you&apos;ll find me hiking the trails my clients now call home.</p>`}
            <div class="designations-line">
              ${designations.map((d, i) => `${i > 0 ? '<span class="des-sep"></span>' : ''}<span class="des-item">${esc(d)}</span>`).join('')}
            </div>
            ${c.brokerageName ? `<div class="brokerage-line"><span>Brokered by</span><strong>${esc(c.brokerageName)}</strong></div>` : ''}
          </div>
        </div>
      </div>
    </section>`;

  // ─── Featured listings ───────────────────────────────────────────────────
  const featuredListings = `
    <section class="sect sect-cream">
      <div class="ctn">
        <div style="text-align:center;margin-bottom:48px" class="rv">
          <span class="eyebrow">Featured Listings</span>
          <h2 class="h2" style="margin-top:12px">Currently on the market.</h2>
          <span class="bar-accent"></span>
          <span class="sample-note">Photos shown are samples — replace with your own listing photography.</span>
        </div>
        <div class="listings-grid">
          ${listings.map((l) => {
            const slug = slugify(l.address || 'property');
            const status = l.status || 'For Sale';
            const hasImg = !!(l.image && l.image.url);
            const photoHtml = hasImg
              ? `<img src="${esc(l.image.url)}" alt="${esc(l.address || 'Property')}" loading="lazy">`
              : `<div class="listing-photo-placeholder">${icon('home', 64, 'rgba(255,255,255,0.5)')}</div>`;
            return `
            <a href="/listings#${slug}" class="listing-card rv">
              <div class="listing-photo">
                ${photoHtml}
                <span class="listing-status ${statusClass(status)}">${esc(status)}</span>
              </div>
              <div class="listing-body">
                <div class="listing-price-wrap">
                  <span class="listing-price-label">${l.price ? 'List Price' : 'Pricing'}</span>
                  <div class="listing-price">${l.price ? esc(fmtMoney(l.price)) : 'Contact'}</div>
                </div>
                <div class="listing-address">${esc(l.address || '')}${l.neighborhood ? `<br><span class="muted">${esc(l.neighborhood)}</span>` : ''}</div>
                <div class="listing-meta">
                  ${l.beds ? `<span>${icon('bed', 16, TOKENS.gold)} ${esc(String(l.beds))} bd</span>` : ''}
                  ${l.baths ? `<span>${icon('bath', 16, TOKENS.gold)} ${esc(String(l.baths))} ba</span>` : ''}
                  ${l.sqft ? `<span>${icon('ruler', 16, TOKENS.gold)} ${esc(Number(l.sqft).toLocaleString())} sqft</span>` : ''}
                </div>
              </div>
            </a>`;
          }).join('')}
        </div>
        <div style="text-align:center;margin-top:48px" class="rv">
          <a href="/listings" class="btn btn-navy">View All Listings</a>
        </div>
      </div>
    </section>`;

  // ─── Neighborhood spotlight ──────────────────────────────────────────────
  const neighborhoodSpotlight = neighborhoods.length ? `
    <section class="sect">
      <div class="ctn">
        <div style="text-align:center;margin-bottom:48px" class="rv">
          <span class="eyebrow">Neighborhoods I Know Best</span>
          <h2 class="h2" style="margin-top:12px">${city ? `Where ${esc(city)} feels like home.` : 'Where my clients put down roots.'}</h2>
          <span class="bar-accent"></span>
        </div>
        <div class="neighborhoods-grid">
          ${neighborhoods.slice(0, 6).map((n) => {
            const desc = (c.areaDescriptions && (c.areaDescriptions[n] || c.areaDescriptions[n.toLowerCase()])) ||
              `Quiet streets, walkable amenities, and the kind of community that shows up when it matters. Ask me what&apos;s currently moving in ${esc(n)}.`;
            const median = (c.areaMedianPrices && (c.areaMedianPrices[n] || c.areaMedianPrices[n.toLowerCase()])) || null;
            const yoyMap = c.areaYoY || {};
            const yoyRaw = yoyMap[n] != null ? yoyMap[n] : (yoyMap[n.toLowerCase()] != null ? yoyMap[n.toLowerCase()] : null);
            const yoy = yoyRaw == null ? null : (typeof yoyRaw === 'number' ? yoyRaw : parseFloat(yoyRaw));
            const trendClass = yoy == null ? '' : (yoy > 0.3 ? 'up' : yoy < -0.3 ? 'down' : 'flat');
            const trendLabel = yoy == null ? '' : `${Math.abs(yoy).toFixed(1)}%`;
            const img = (c.neighborhoodImages && (c.neighborhoodImages[n] || c.neighborhoodImages[n.toLowerCase()])) || null;
            const photoHtml = img && img.url
              ? `<img src="${esc(img.url)}" alt="${esc(n)}" loading="lazy">`
              : `<div class="neighborhood-photo-placeholder"><span class="np-monogram">${esc(n.trim().charAt(0).toUpperCase())}</span><span class="np-sublabel">Photography sample \u2014 replace</span></div>`;
            return `
            <a class="neighborhood-card rv" href="/neighborhoods#${slugify(n)}">
              <div class="neighborhood-photo">
                ${photoHtml}
                <div class="neighborhood-photo-overlay"></div>
                <div class="neighborhood-name">${esc(n)}</div>
              </div>
              <div class="neighborhood-body">
                ${median ? `<div class="neighborhood-stats" style="grid-template-columns:1fr"><span style="text-align:left;align-items:flex-start;padding:0">Median Price<strong>${esc(fmtMoney(median))}${yoy != null ? `<span class="trend-pill ${trendClass}">${esc(trendLabel)}</span>` : ''}</strong></span></div>` : ''}
                <p class="neighborhood-desc">${esc(desc)}</p>
              </div>
            </a>`;
          }).join('')}
        </div>
      </div>
    </section>` : '';

  // ─── Testimonials carousel ───────────────────────────────────────────────
  const tList = (c.testimonials && c.testimonials.length ? c.testimonials.slice(0, 4) : [
    { quote: 'We had three failed offers before working together. By the fourth weekend our keys were in hand. The negotiation alone was worth every cent.', name: 'Lauren & Mark Whitfield', role: `Buyers${city ? ` · ${city}` : ''}` },
    { quote: 'Sold over asking in the first weekend. The CMA was spot on and the staging suggestions made the photos sing.', name: 'Patricia Donnelly', role: `Seller${city ? ` · ${city}` : ''}` },
    { quote: 'I bought my first investment property here. The numbers were honest, the inspection was thorough, and the cash flow has tracked exactly to plan.', name: 'Daniel Rivera', role: `Investor${city ? ` · ${city}` : ''}` },
  ]).map((t) => ({ ...t, avatar: (t.name || 'C').trim().charAt(0).toUpperCase() }));

  const stars5 = Array.from({ length: 5 }).map(() => iconFilled('star', 14, TOKENS.gold)).join('');

  const testimonials = `
    <section class="sect sect-cream">
      <div class="ctn">
        <div style="text-align:center;margin-bottom:36px" class="rv">
          <span class="eyebrow">In Their Words</span>
          <h2 class="h2" style="margin-top:12px">Stories from past clients.</h2>
          <span class="bar-accent"></span>
          <div style="display:flex;justify-content:center"><div class="google-badge">
            ${googleGlyph(22)}
            <div class="gb-rating">${esc(rating)}<span class="gb-stars">${stars5}</span></div>
            <div class="gb-divider"></div>
            <div class="gb-meta"><strong>Google Reviews</strong><span>${esc(reviewCount)} verified clients</span></div>
          </div></div>
        </div>
        <div class="testi-carousel rv">
          <div class="testi-track">
            ${tList.map((t) => `
              <div class="testi-card">
                <div class="testi-stars">${stars5}</div>
                <p class="testi-quote">${esc(t.quote)}</p>
                <div class="testi-meta">
                  <span class="testi-avatar">${esc(t.avatar)}</span>
                  <div><div class="testi-name">${esc(t.name)}</div><div class="testi-role">${esc(t.role)}</div></div>
                </div>
              </div>`).join('')}
          </div>
          <div class="testi-nav">
            <button class="testi-btn" data-prev aria-label="Previous">${icon('arrowRight', 18)}</button>
            <div class="testi-dots">${tList.map((_, i) => `<button class="testi-dot${i === 0 ? ' is-active' : ''}" aria-label="Go to ${i + 1}"></button>`).join('')}</div>
            <button class="testi-btn" data-next aria-label="Next">${icon('arrowRight', 18)}</button>
          </div>
        </div>
      </div>
    </section>`;

  // ─── Valuation banner ────────────────────────────────────────────────────
  const valuationBanner = `
    <section class="valuation-banner">
      <div class="ctn">
        <div class="rv">
          <span class="eyebrow">Thinking of Selling?</span>
          <h2 class="h2">${esc(c.valuationCallout || 'Curious what your home would sell for today?')}</h2>
          <p class="body-lg">Get a free comparative market analysis (CMA) tailored to your home and neighborhood. I&apos;ll personally review your details and send a written report within 24 hours — no commitment, no pressure.</p>
        </div>
        <div class="valuation-card rv">
          <h3>Request your free CMA</h3>
          <form ${netlifyFormAttrs('valuation', '/thank-you-cma/')}>
            ${netlifyHiddenFields('valuation')}
            <div class="form-grid">
              <div class="form-row-full">
                <label class="form-label" for="v-address">Property Address</label>
                <input id="v-address" name="address" class="form-input" type="text" placeholder="123 Main St" required>
              </div>
              <div>
                <label class="form-label" for="v-name">Your Name</label>
                <input id="v-name" name="name" class="form-input" type="text" required>
              </div>
              <div>
                <label class="form-label" for="v-phone">Phone</label>
                <input id="v-phone" name="phone" class="form-input" type="tel" required>
              </div>
              <div class="form-row-full">
                <label class="form-label" for="v-email">Email</label>
                <input id="v-email" name="email" class="form-input" type="email" required>
              </div>
              <div class="form-row-full" style="padding-top:6px">
                <button type="submit" class="btn btn-gold btn-lg" style="width:100%">Get my free CMA</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </section>`;

  // ─── Market Snapshot — dark editorial section ────────────────────────────
  const ms = c.marketStats || {};
  const medianPrice = ms.medianPrice || 575000;
  const dom = ms.daysOnMarket || 32;
  const yoy = ms.yearOverYearPct != null ? ms.yearOverYearPct : 4.2;
  const newListings = ms.newListingsThisWeek || 18;
  const yoyArrow = yoy >= 0 ? '<span class="ms-arrow up">▲</span>' : '<span class="ms-arrow down">▼</span>';
  const yoyAbs = Math.abs(yoy).toFixed(1);

  const marketSnapshot = `
    <section class="market-snap">
      <div class="ctn" style="text-align:center">
        <div class="rv">
          <span class="eyebrow">Market Snapshot</span>
          <h2 class="h2">${city ? `Where the ${esc(city)} market sits today.` : 'Where the market sits today.'}</h2>
          <span class="bar-accent"></span>
          <p class="body-lg">A current pulse on the area — what homes are selling for, how fast, and which way the market is leaning.</p>
        </div>
        <div class="market-grid">
          <div class="market-cell rv">
            <div class="market-num">${esc(fmtMoney(medianPrice))}</div>
            <span class="market-label">Median Sale Price</span>
          </div>
          <div class="market-cell rv">
            <div class="market-num">${esc(String(dom))}<span class="ms-suffix">days</span></div>
            <span class="market-label">Avg Days on Market</span>
          </div>
          <div class="market-cell rv">
            <div class="market-num">${yoyArrow}${esc(yoyAbs)}<span class="ms-suffix">%</span></div>
            <span class="market-label">Year-over-Year</span>
          </div>
          <div class="market-cell rv">
            <div class="market-num">${esc(String(newListings))}</div>
            <span class="market-label">New Listings This Week</span>
          </div>
        </div>
        <span class="market-disclaimer">Estimates based on ${esc(city || 'local')} market averages. Reach out for an analysis specific to your block.</span>
      </div>
    </section>`;

  const body = hero + statsStrip + agentIntro + featuredListings + neighborhoodSpotlight + marketSnapshot + testimonials + valuationBanner;

  return wrapRealEstatePage(c, '/', body, {
    title: `${c.businessName}${city ? ` — Real Estate in ${city}` : ''}${c.brokerageName ? ` | ${c.brokerageName}` : ''}`,
    description: `${c.businessName}: ${city ? `your trusted real estate expert in ${city}. ` : ''}${homesSold} homes sold, ${years}+ years local. ${phone ? `Call ${phone}.` : ''}`,
    schemas: [getRealEstateAgentSchema(c)],
    heroPal: computeHeroPaletteFromConfig(c),
  });
}

module.exports = { generateHomePage };
