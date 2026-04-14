const { esc, telHref, icon, iconFilled, wrapHvacPage, getLocalBusinessSchema, TOKENS } = require('./common');

function generateAboutPage(c) {
  const phone = c.contactPhone || '';
  const tel = telHref(phone);
  const years = c.yearsExperience || '15';
  const city = c.primaryCity || '';
  const jobs = c.jobsCompleted || '500+';
  const reviews = c.reviewCount || '287';
  const rating = c.googleRating || '4.9';
  const teamPhoto = c.heroImage && c.heroImage.url; // reuse hero Unsplash on About
  const founderFirstName = (c.founderFirstName || 'Jake');
  const foundedYear = c.foundedYear || (new Date().getFullYear() - (parseInt(years, 10) || 15));

  // ─── Hero ─────────────────────────────────────────────────────────────────
  const hero = `
    <section class="page-hero">
      <div class="ctn">
        <p class="crumb"><a href="/">Home</a> &rsaquo; About</p>
        <h1 class="h1">About ${esc(c.businessName)}.</h1>
        <p class="body-lg">${esc(c.aboutTagline || `The ${city || 'local'} HVAC team homeowners actually recommend by name.`)}</p>
        <div class="trust-row" style="display:inline-flex;margin-top:28px">
          <span class="t-item">${iconFilled('star', 16, '#F59E0B')} ${esc(rating)} rating (${esc(reviews)} reviews)</span>
          <span class="t-sep"></span>
          <span class="t-item">Licensed &amp; insured</span>
          <span class="t-sep"></span>
          <span class="t-item">NATE-certified</span>
          <span class="t-sep"></span>
          <span class="t-item">${esc(years)}+ years serving ${esc(city || 'your area')}</span>
        </div>
      </div>
    </section>`;

  // ─── Our Story — split with founder frame + signature ─────────────────────
  const story = `
    <section class="sect">
      <div class="ctn">
        <div class="story-grid">
          <div class="rv">
            <span class="eyebrow">Our Story</span>
            <h2 class="h2 mt-4">${esc(c.aboutTitle || 'Built on trust. Grown by referral.')}</h2>
            <span class="bar-accent bar-accent-l"></span>
            <p class="body mt-6 mb-4">${esc(c.aboutText || `${c.businessName} started in a two-truck garage in ${foundedYear} with one rule: treat every home like your own mother lives there. Years later, that rule still runs the business.`)}</p>
            <p class="body">${esc(c.aboutText2 || `We never push a replacement when a repair will do. We never charge diagnostic fees if we take the job. And we never leave a home until the dust cloth has done its rounds.`)}</p>
            <div class="signature">
              <span style="display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,${TOKENS.trust},${TOKENS.action});color:#fff;font-weight:800;font-family:'Plus Jakarta Sans',sans-serif">${esc(founderFirstName.charAt(0))}</span>
              <div>
                <div class="signature-name">${esc(founderFirstName)}</div>
                <div class="signature-role">Founder &amp; Lead Technician</div>
              </div>
            </div>
          </div>

          <div class="rv founder-frame">
            <div class="founder-photo">
              ${teamPhoto ? `<img src="${esc(teamPhoto)}" alt="${esc(c.businessName)} team" loading="lazy">` : `<div class="fp-placeholder">${icon('wrench', 96, '#fff')}</div>`}
            </div>
            <div class="fp-badge">
              <strong>Proudly serving ${esc(city || 'your neighborhood')}</strong>
              <span>Since ${esc(foundedYear)}</span>
            </div>
          </div>
        </div>
      </div>
    </section>`;

  // ─── Big stats (dark bg) ─────────────────────────────────────────────────
  const bigStats = `
    <section class="stats-dark">
      <div class="ctn">
        <div class="stats-row">
          <div class="stat-cell rv"><span class="stat-num">${esc(String(jobs))}</span><span class="stat-label">Jobs Completed</span></div>
          <div class="stat-cell rv"><span class="stat-num">${esc(years)}+</span><span class="stat-label">Years in Business</span></div>
          <div class="stat-cell rv"><span class="stat-num">${esc(String(reviews))}</span><span class="stat-label">Happy Customers</span></div>
        </div>
      </div>
    </section>`;

  // ─── Team banner (single wide photo, replaces wrench circles) ────────────
  const teamBanner = `
    <section class="sect">
      <div class="ctn">
        <div class="center mb-8 rv">
          <span class="eyebrow">Meet the Team</span>
          <h2 class="h2 mt-4">The people showing up at your door.</h2>
          <span class="bar-accent"></span>
        </div>
        <div class="team-banner rv">
          ${teamPhoto ? `<img src="${esc(teamPhoto)}" alt="${esc(c.businessName)} technicians on the job" loading="lazy">` : `<div class="team-banner-fallback">${icon('wrench', 96, 'rgba(255,255,255,0.6)')}</div>`}
          <div class="team-banner-overlay">
            <div class="team-banner-text">
              <span class="eyebrow">${esc(years)}+ YEARS &middot; ${esc(city || 'local')}</span>
              <h3>Friendly, certified, and background-checked &mdash; every single one.</h3>
              <p>No revolving door of contractors. Our technicians are full-time employees, trained in-house, and paid well enough to do the job right the first time.</p>
              <span class="replace-note">${iconFilled('star', 12, TOKENS.orange)} Replace with your team&apos;s real photo to build 3&times; more trust</span>
            </div>
          </div>
        </div>
      </div>
    </section>`;

  // ─── Credentials — fixed layout ──────────────────────────────────────────
  const credentials = `
    <section class="sect sect-soft">
      <div class="ctn">
        <div class="center mb-8 rv">
          <span class="eyebrow">Credentials</span>
          <h2 class="h2 mt-4">Licensed. Insured. Trained.</h2>
          <span class="bar-accent"></span>
        </div>
        <div class="cred-grid">
          ${[
            { label: 'Accreditation 01', title: 'Licensed Contractor', desc: 'State-issued HVAC contractor license, renewed annually and publicly verifiable.', tag: c.licenseNumber ? `License #${esc(c.licenseNumber)}` : 'State licensed' },
            { label: 'Accreditation 02', title: 'Fully Insured', desc: 'General liability coverage plus workers compensation on every job, every tech, every day.', tag: 'Up to $2M coverage' },
            { label: 'Accreditation 03', title: 'NATE Certified', desc: 'North American Technician Excellence &mdash; the industry gold standard for HVAC skill.', tag: 'NATE-certified' },
            { label: 'Accreditation 04', title: 'Background Checked', desc: 'Every technician screened before hire and re-verified every year. No exceptions.', tag: 'Verified annually' },
          ].map((b) => `
            <div class="cred-card rv">
              <span class="cred-label">${b.label}</span>
              <h4 class="cred-title">${b.title}</h4>
              <p class="cred-desc">${b.desc}</p>
              <span class="cred-tag">${b.tag}</span>
            </div>`).join('')}
        </div>
      </div>
    </section>`;

  // ─── Values — numbered editorial ─────────────────────────────────────────
  const values = `
    <section class="sect">
      <div class="ctn">
        <div class="center mb-8 rv">
          <span class="eyebrow">What We Stand For</span>
          <h2 class="h2 mt-4">On time. Clean work. Fair prices.</h2>
          <span class="bar-accent"></span>
        </div>
        <div class="values-grid">
          ${[
            { t: 'On time.', d: 'We show up in the window we give you, or we call ahead. Your day shouldn\u2019t revolve around our schedule.' },
            { t: 'Clean work.', d: 'Shoe covers on. Drop cloths down. We leave your home tidier than we found it &mdash; guaranteed.' },
            { t: 'Fair prices.', d: 'Flat rate given before the job starts. No surprise fees. No &ldquo;while we\u2019re here&rdquo; upsells. Ever.' },
          ].map((v, i) => `
            <div class="value-card rv">
              <span class="value-num">${String(i + 1).padStart(2, '0')}</span>
              <h3>${v.t}</h3>
              <p>${v.d}</p>
            </div>`).join('')}
        </div>
      </div>
    </section>`;

  // ─── Guarantee callout — prominent promise ───────────────────────────────
  const guarantee = `
    <section class="sect sect-soft">
      <div class="ctn">
        <div class="guarantee-card rv">
          <div class="guarantee-grid">
            <div>
              <span class="eyebrow">Our Promise</span>
              <h2 class="h2">If you&apos;re not happy, we come back &mdash; free.</h2>
              <p>No arguments. No &ldquo;service fees&rdquo;. No hassle paperwork. If a repair doesn&apos;t hold or an install isn&apos;t right, we&apos;re on your doorstep again on our own dime until it is.</p>
              <div class="flex flex-wrap gap-12 mt-6">
                <a href="/contact" class="btn btn-orange">Request a Free Quote ${icon('arrowRight', 16, '#fff')}</a>
                ${phone ? `<a href="tel:${esc(tel)}" class="btn btn-outline-white">Call ${esc(phone)}</a>` : ''}
              </div>
            </div>
            <div class="guarantee-seal">
              <div class="seal-ring">
                <strong>100%</strong>
                <span>Satisfaction</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>`;

  // ─── Final CTA ───────────────────────────────────────────────────────────
  const ctaBanner = `
    <section class="cta-banner">
      <div class="ctn rv">
        <h2 class="h2">Ready to experience the difference?</h2>
        <p class="body-lg">Get a free quote in minutes &mdash; no pressure, no pushy sales.</p>
        <div class="flex flex-wrap gap-12" style="justify-content:center">
          <a href="/contact" class="btn btn-orange btn-lg">Get a Free Quote ${icon('arrowRight', 18, '#fff')}</a>
          ${phone ? `<a href="tel:${esc(tel)}" class="btn btn-outline-white btn-lg">Call ${esc(phone)}</a>` : ''}
        </div>
      </div>
    </section>`;

  const body = hero + story + bigStats + teamBanner + credentials + values + guarantee + ctaBanner;

  return wrapHvacPage(c, '/about', body, {
    title: `About ${c.businessName} | HVAC${city ? ` in ${city}` : ''}`,
    description: `${c.businessName} &mdash; licensed, insured HVAC team${city ? ` in ${city}` : ''}. ${years}+ years, ${reviews}+ reviews, NATE-certified technicians.`,
    schemas: [getLocalBusinessSchema(c)],
  });
}

module.exports = { generateAboutPage };
