const { esc, telHref, icon, iconFilled, googleGlyph, wrapHvacPage, getLocalBusinessSchema, getServiceListSchema, getTradeCopy, TOKENS } = require('./common');

function generateHomePage(c) {
  const tc = getTradeCopy(c);
  const phone = c.contactPhone || '';
  const tel = telHref(phone);
  const city = c.primaryCity || '';
  const rating = c.googleRating || '4.9';
  const reviewCount = c.reviewCount || '200+';
  const years = c.yearsExperience || '';
  const areas = (c.serviceAreas || []).slice(0, 12);
  const hasHeroImg = !!(c.heroImage && c.heroImage.url);
  const stars5Filled = Array.from({ length: 5 }).map(() => iconFilled('star', 16, '#F59E0B')).join('');
  const stars5Tiny = Array.from({ length: 5 }).map(() => iconFilled('star', 13, '#F59E0B')).join('');

  // ─── Hero ─────────────────────────────────────────────────────────────────
  const heroPhotoInner = hasHeroImg
    ? `<div class="hero-photo" style="background:url('${esc(c.heroImage.url)}') center/cover no-repeat"></div>`
    : `<div class="hero-photo">
         <div class="hero-photo-icon">${icon('wrench', 96, '#fff')}</div>
         <span class="hero-photo-tip">${icon('star', 12, '#fff')} Add your team photo</span>
       </div>`;

  const heroPhoto = `
    <div class="hero-photo-wrap">
      ${heroPhotoInner}
      <div class="hero-badge">
        <span class="stars">${stars5Tiny}</span>
        <span class="badge-text">
          <strong>${esc(rating)} / 5</strong>
          <span>${esc(reviewCount)} Google Reviews</span>
        </span>
      </div>
    </div>`;

  const trustChips = [
    { icon: 'checkCircle', label: 'Licensed & Insured' },
    { icon: 'clock', label: 'Same-Day Service' },
    { icon: 'dollar', label: 'Upfront Pricing' },
    years ? { icon: 'award', label: `${esc(years)}+ Years Experience` } : null,
  ].filter(Boolean);

  const trustRow = trustChips.map((t, i) => {
    const item = `<span class="t-item">${icon(t.icon, 18)} ${t.label}</span>`;
    const sep = i < trustChips.length - 1 ? '<span class="t-sep"></span>' : '';
    return item + sep;
  }).join('');

  const hero = `
    <section class="hero">
      <div class="ctn">
        <div class="hero-grid">
          <div class="rv">
            <span class="chip chip-orange" style="margin-bottom:18px">
              ${iconFilled('star', 14, '#F97316')} Rated ${esc(rating)} &middot; ${esc(reviewCount)} Google Reviews
            </span>
            <h1 class="h1 mb-4">${city ? `${esc(city)}'s Trusted` : 'Your Trusted'}<br><span style="color:${TOKENS.action}">${esc(tc.heroAccent)}</span> Experts.</h1>
            <p class="body-lg mb-6" style="max-width:560px">${esc(c.heroSub || tc.heroSub)}</p>
            <div class="flex flex-wrap gap-12 mb-6">
              <a href="/contact" class="btn btn-orange btn-lg">Request Free Quote ${icon('arrowRight', 18, '#fff')}</a>
              ${phone ? `<a href="tel:${esc(tel)}" class="btn btn-outline btn-lg">${icon('phone', 18)} Call Now: ${esc(phone)}</a>` : ''}
            </div>
            <div class="trust-row">${trustRow}</div>
          </div>
          <div class="rv">${heroPhoto}</div>
        </div>
      </div>
    </section>`;

  // ─── Services grid (first 6) — image-top cards ───────────────────────────
  const services = (c.services || []).slice(0, 6).map((s) => {
    const slug = esc((s.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    const priceLabel = s.priceFrom
      ? (/[a-zA-Z]/.test(String(s.priceFrom)) ? esc(s.priceFrom) : `From $${esc(s.priceFrom)}`)
      : null;
    const media = (s.image && s.image.url)
      ? `<img src="${esc(s.image.url)}" alt="${esc(s.title)}" loading="lazy">`
      : `<div class="svc-media-placeholder">${icon('wrench', 56, 'rgba(255,255,255,0.65)')}</div>`;
    return `
    <a class="svc-card rv" href="/services#${slug}">
      <div class="svc-media">
        ${media}
        ${priceLabel ? `<span class="svc-price-abs">${priceLabel}</span>` : ''}
      </div>
      <div class="svc-body">
        <h3 class="ff-display">${esc(s.title)}</h3>
        <p>${esc(s.shortDescription || '')}</p>
        <span class="svc-link">Learn more ${icon('arrowRight', 14, TOKENS.action)}</span>
      </div>
    </a>`;
  }).join('');

  const servicesSection = `
    <section class="sect sect-soft">
      <div class="ctn">
        <div class="center mb-8 rv">
          <span class="eyebrow" style="display:inline-block">${esc(tc.servicesEyebrow)}</span>
          <h2 class="h2 mt-4">From emergency repairs to full installations.</h2>
          <span class="bar-accent"></span>
          <p class="body mt-6" style="max-width:620px;margin:24px auto 0">Everything you need to stay comfortable, year-round. One call, one trusted team.</p>
        </div>
        <div class="grid grid-3">${services}</div>
        <div class="center mt-8 rv">
          <a href="/services" class="btn btn-blue">View All Services ${icon('arrowRight', 16, '#fff')}</a>
        </div>
      </div>
    </section>`;

  // ─── Why Choose Us — horizontal bars (different layout from services) ────
  const pillars = (c.whyChooseUs && c.whyChooseUs.length >= 4 ? c.whyChooseUs.slice(0, 4) : [
    { title: '24/7 Emergency Response', description: 'Day or night, we\u2019re one call away.', icon: 'siren' },
    { title: 'Upfront, Honest Pricing', description: 'No hidden fees. Know the cost before we start.', icon: 'dollar' },
    { title: 'Licensed & Certified Techs', description: 'Trained, background-checked, fully insured professionals.', icon: 'shieldCheck' },
    { title: '100% Satisfaction Guarantee', description: 'Not happy? We\u2019ll make it right. No questions asked.', icon: 'checkCircle' },
  ]);

  const whyChoose = `
    <section class="sect">
      <div class="ctn">
        <div class="center mb-8 rv">
          <span class="eyebrow" style="display:inline-block">Why Choose ${esc(c.businessName)}</span>
          <h2 class="h2 mt-4">Your comfort. Our commitment.</h2>
          <span class="bar-accent"></span>
        </div>
        <div class="why-row">
          ${pillars.map((p, i) => `
            <div class="why-item rv">
              <span class="why-num">${String(i + 1).padStart(2, '0')}</span>
              <div class="why-body">
                <h4>${esc(p.title)}</h4>
                <p>${esc(p.description)}</p>
              </div>
            </div>`).join('')}
        </div>
      </div>
    </section>`;

  // ─── Testimonials — filled stars, quote mark, real Google G ─────────────
  // Fallback testimonial set is chosen per-trade (HVAC vs plumbing). See
  // TRADE_COPY.fallbackTestimonials in ./common.js. User-supplied
  // testimonials (from the LLM content prompt or manual input) still win.
  const tList = (c.testimonials && c.testimonials.length ? c.testimonials.slice(0, 3) : tc.fallbackTestimonials(city))
    .map((t, i) => ({ ...t, avatar: (t.name || 'U').trim().charAt(0).toUpperCase(), avatarVariant: `av-${(i % 3) + 1}` }));


  const testimonials = `
    <section class="sect sect-soft">
      <div class="ctn">
        <div class="center mb-8 rv">
          <span class="eyebrow" style="display:inline-block">What Our Customers Say</span>
          <h2 class="h2 mt-4">Trusted by ${esc(reviewCount)} homeowners${city ? ` in ${esc(city)}` : ''}.</h2>
          <span class="bar-accent"></span>
          <div style="display:inline-flex;align-items:center;gap:10px;font-weight:600;color:${TOKENS.heading};margin-top:18px;flex-wrap:wrap;justify-content:center">
            <span style="display:inline-flex;gap:2px">${stars5Filled}</span>
            <span>${esc(rating)} average rating</span>
            ${c.googleProfileUrl ? `<a href="${esc(c.googleProfileUrl)}" target="_blank" rel="noopener" style="color:${TOKENS.action}">See all reviews \u2192</a>` : ''}
          </div>
        </div>
        <div class="testi-carousel rv">
          <div class="testi-track">
            ${tList.map((t) => `
              <div class="testi">
                <div class="stars">${stars5Filled}</div>
                <p class="testi-q">${esc(t.quote)}</p>
                <div class="testi-meta">
                  <span class="avatar ${t.avatarVariant}">${esc(t.avatar)}</span>
                  <div><p class="testi-name">${esc(t.name)}</p><p class="testi-role">${esc(t.role)}</p></div>
                  <span class="g-pill">${googleGlyph(16)} Google</span>
                </div>
              </div>`).join('')}
          </div>
          <div class="testi-nav">
            <button class="testi-btn" data-testi-prev aria-label="Previous">${icon('arrowRight', 18)}</button>
            <div class="testi-dots">
              ${tList.map((_, i) => `<button class="testi-dot${i === 0 ? ' is-active' : ''}" aria-label="Go to ${i + 1}"></button>`).join('')}
            </div>
            <button class="testi-btn" data-testi-next aria-label="Next">${icon('arrowRight', 18)}</button>
          </div>
        </div>
      </div>
    </section>`;

  // ─── Service areas — split map + enriched cards ──────────────────────────
  const radius = areas.length >= 6 ? '25-mile' : '15-mile';
  const mapsQuery = encodeURIComponent(city || (areas[0] || 'service area'));
  // Rough per-area response-time variation so each card feels unique.
  const responseMinutes = [25, 32, 28, 35, 30, 40, 38, 45, 33, 36, 42, 48];
  const distanceMiles = [0, 16, 18, 14, 22, 27, 19, 24, 20, 30, 26, 32];
  const areasSection = areas.length ? `
    <section class="sect">
      <div class="ctn">
        <div class="center mb-8 rv">
          <span class="eyebrow" style="display:inline-block">Service Areas</span>
          <h2 class="h2 mt-4">Proudly serving${city ? ` greater ${esc(city)}` : ' your neighborhood'}.</h2>
          <span class="bar-accent"></span>
          <p class="area-stat" style="margin-top:24px">${icon('mapPin', 16, TOKENS.action)} <strong>${areas.length}</strong> cities &middot; ${radius} service radius &middot; avg response 30 min</p>
        </div>
        <div class="area-split rv">
          <div class="area-map">
            <iframe loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=${mapsQuery}&z=10&output=embed" title="Service coverage map"></iframe>
            <div class="area-map-overlay">
              <span class="map-ico">${icon('mapPin', 18, '#fff')}</span>
              <div>
                <strong>${esc(city || areas[0])}</strong>
                <span>Headquarters &middot; Trucks dispatched daily</span>
              </div>
            </div>
          </div>
          <div class="area-cards" role="list">
            ${areas.map((a, i) => {
              const mins = responseMinutes[i % responseMinutes.length];
              const miles = i === 0 ? 'HQ' : `${distanceMiles[i % distanceMiles.length]} mi`;
              return `
              <a class="area-card" role="listitem" href="/areas#${esc(a.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}">
                <span class="ac-ico">${icon('mapPin', 20)}</span>
                <div class="ac-body">
                  <div class="ac-name">${esc(a)}</div>
                  <div class="ac-meta">
                    <span>${icon('clock', 14)} ~${mins} min response</span>
                    <span>${icon('wrench', 14)} Same-day available</span>
                    <span style="color:${TOKENS.muted}">${miles}</span>
                  </div>
                </div>
                <span class="ac-go">${icon('arrowRight', 18)}</span>
              </a>`;
            }).join('')}
          </div>
        </div>
        <div class="center mt-8 rv"><a href="/areas" class="btn btn-outline btn-sm">View All Service Areas ${icon('arrowRight', 14)}</a></div>
      </div>
    </section>` : '';

  // ─── Final dark CTA banner ───────────────────────────────────────────────
  const ctaBanner = `
    <section class="cta-banner">
      <div class="ctn rv">
        <h2 class="h2">Need HVAC service? We&apos;re ready.</h2>
        <p class="body-lg">Same-day appointments available. Call now or request a free quote online.</p>
        <div class="flex flex-wrap gap-12" style="justify-content:center">
          <a href="/contact" class="btn btn-orange btn-lg">Get a Free Quote ${icon('arrowRight', 18, '#fff')}</a>
          ${phone ? `<a href="tel:${esc(tel)}" class="btn btn-outline-white btn-lg">${icon('phone', 18, '#fff')} Call ${esc(phone)}</a>` : ''}
        </div>
      </div>
    </section>`;

  const body = hero + servicesSection + whyChoose + testimonials + areasSection + ctaBanner;

  return wrapHvacPage(c, '/', body, {
    title: `${c.businessName} — ${tc.pageMetaTitleTail(city)}`,
    description: tc.heroSeoDesc(c.businessName, city, phone),
    schemas: [getLocalBusinessSchema(c), getServiceListSchema(c)],
  });
}

module.exports = { generateHomePage };
