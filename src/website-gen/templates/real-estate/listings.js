const {
  esc, telHref, slugify, fmtMoney, icon,
  wrapRealEstatePage, getRealEstateAgentSchema, TOKENS, DEFAULT_LISTINGS,
} = require('./common');

function statusClass(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('just listed') || s.includes('new')) return 's-just-listed';
  if (s.includes('pending')) return 's-pending';
  if (s.includes('sold')) return 's-sold';
  return '';
}

function statusSlug(status) {
  return String(status || 'For Sale').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function generateListingsPage(c) {
  const phone = c.contactPhone || '';
  const tel = telHref(phone);
  const city = c.primaryCity || '';
  const listings = (Array.isArray(c.featuredListings) && c.featuredListings.length ? c.featuredListings : DEFAULT_LISTINGS);
  const allAreas = (c.serviceAreas || []);

  // Count by status for filter chip counts
  const countBy = (pred) => listings.filter(pred).length;
  const totals = {
    all: listings.length,
    'for-sale': countBy((l) => /for sale/i.test(l.status || '')),
    'just-listed': countBy((l) => /just listed|new/i.test(l.status || '')),
    pending: countBy((l) => /pending/i.test(l.status || '')),
  };
  const neighborhoodCounts = {};
  listings.forEach((l) => {
    if (!l.neighborhood) return;
    const k = l.neighborhood;
    neighborhoodCounts[k] = (neighborhoodCounts[k] || 0) + 1;
  });
  const neighborhoodsInListings = Object.keys(neighborhoodCounts);
  // Use only neighborhoods that have listings, or fall back to c.serviceAreas.
  const filterNeighborhoods = neighborhoodsInListings.length ? neighborhoodsInListings : allAreas;

  const hero = `
    <section class="page-hero">
      <div class="ctn">
        <p class="crumb"><a href="/">Home</a> / Listings</p>
        <h1 class="h1">Browse current listings.</h1>
        <p class="body-lg">${city ? `Hand-picked properties across ${esc(city)} and surrounding neighborhoods.` : 'Hand-picked properties across the area.'} Updated weekly.</p>
        <div class="page-hero-stats">
          <span class="phs-item"><strong data-result-count>${listings.length}</strong> Active ${listings.length === 1 ? 'Listing' : 'Listings'}</span>
          <span class="phs-sep"></span>
          <span class="phs-item"><strong>${filterNeighborhoods.length}</strong> ${filterNeighborhoods.length === 1 ? 'Neighborhood' : 'Neighborhoods'}</span>
          <span class="phs-sep"></span>
          <span class="phs-item">Updated weekly</span>
        </div>
      </div>
    </section>`;

  const mlsBanner = `
    <div class="mls-banner rv">
      <div class="mls-text">
        <h3>🏠 Live MLS listings coming soon</h3>
        <p>This page shows a curated selection. Reach out directly to see <em>everything</em> currently available — including off-market opportunities I&apos;m sharing with my clients first.</p>
      </div>
      <div>
        <a href="/contact" class="btn btn-navy">See Live Inventory</a>
      </div>
    </div>
    <p class="sample-note" style="text-align:center;margin-bottom:12px">Photos shown are samples — replace with your own listing photography.</p>`;

  const filterChips = `
    <div class="filter-chips-wrap">
      <span class="filter-chips-label">Filter by status</span>
      <div class="filter-chips">
        <button class="filter-chip is-active" data-group="status" data-value="all" type="button">All <span class="chip-count">${totals.all}</span></button>
        ${totals['for-sale'] > 0 ? `<button class="filter-chip" data-group="status" data-value="for-sale" type="button">For Sale <span class="chip-count">${totals['for-sale']}</span></button>` : ''}
        ${totals['just-listed'] > 0 ? `<button class="filter-chip" data-group="status" data-value="just-listed" type="button">Just Listed <span class="chip-count">${totals['just-listed']}</span></button>` : ''}
        ${totals.pending > 0 ? `<button class="filter-chip" data-group="status" data-value="pending" type="button">Pending <span class="chip-count">${totals.pending}</span></button>` : ''}
        ${filterNeighborhoods.length ? `<div class="filter-chips-divider"></div>
        <span class="filter-chips-sublabel">Neighborhood:</span>
        <button class="filter-chip is-active" data-group="neighborhood" data-value="all" type="button">All Areas</button>
        ${filterNeighborhoods.map((n) => `<button class="filter-chip" data-group="neighborhood" data-value="${slugify(n)}" type="button">${esc(n)} <span class="chip-count">${neighborhoodCounts[n] || 0}</span></button>`).join('')}` : ''}
      </div>
    </div>`;

  const sortBar = `
    <div class="sort-bar">
      <span class="sort-bar-label">Sort by</span>
      <select class="sort-select" data-sort aria-label="Sort listings">
        <option value="featured">Featured</option>
        <option value="price-asc">Price: Low to High</option>
        <option value="price-desc">Price: High to Low</option>
        <option value="size-desc">Size: Largest First</option>
        <option value="status">Just Listed First</option>
      </select>
    </div>`;

  // Pick the most compelling listing for the featured hero card: prefer a
  // Just Listed, otherwise the most expensive For Sale, otherwise the first.
  const featuredIdx = (() => {
    const jl = listings.findIndex((l) => /just listed|new/i.test(l.status || ''));
    if (jl >= 0) return jl;
    const forSale = listings
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => /for sale/i.test(l.status || ''))
      .sort((a, b) => (b.l.price || 0) - (a.l.price || 0));
    return forSale.length ? forSale[0].i : 0;
  })();

  const renderCard = (l, variant = 'card') => {
    const slug = slugify(l.address || 'property');
    const status = l.status || 'For Sale';
    const sStatus = statusSlug(status);
    const sNeighborhood = slugify(l.neighborhood || '');
    const hasImg = !!(l.image && l.image.url);
    const photoHtml = hasImg
      ? `<img src="${esc(l.image.url)}" alt="${esc(l.address || 'Property')}" loading="lazy">`
      : `<div class="listing-photo-placeholder">${icon('home', 64, 'rgba(255,255,255,0.5)')}</div>`;
    const priceStr = l.price ? esc(fmtMoney(l.price)) : 'Contact';
    const metaItems = [
      l.beds ? `<span>${icon('bed', 18, TOKENS.gold)}<strong>${esc(String(l.beds))}</strong>bd</span>` : '',
      l.baths ? `<span>${icon('bath', 18, TOKENS.gold)}<strong>${esc(String(l.baths))}</strong>ba</span>` : '',
      l.sqft ? `<span>${icon('ruler', 18, TOKENS.gold)}<strong>${esc(Number(l.sqft).toLocaleString())}</strong>sqft</span>` : '',
    ].filter(Boolean).join('');

    if (variant === 'featured') {
      return `
      <a href="/contact?property=${encodeURIComponent(l.address || '')}" id="${slug}" class="listing-featured rv" data-status="${sStatus}" data-neighborhood="${sNeighborhood}" data-price="${l.price || 0}" data-sqft="${l.sqft || 0}">
        <div class="listing-photo">
          ${photoHtml}
          <span class="listing-status ${statusClass(status)}">${esc(status)}</span>
        </div>
        <div class="listing-featured-body">
          <span class="listing-featured-eyebrow">Featured Property</span>
          <div class="listing-featured-address">${esc(l.address || '')}</div>
          ${l.neighborhood ? `<div class="listing-featured-neighborhood">${esc(l.neighborhood)}${c.primaryCity ? `, ${esc(c.primaryCity)}` : ''}</div>` : ''}
          <div class="listing-featured-price-wrap">
            <span class="listing-featured-price-label">${l.price ? 'List Price' : 'Pricing'}</span>
            <div class="listing-featured-price">${priceStr}</div>
          </div>
          <div class="listing-featured-meta">${metaItems}</div>
          <div class="listing-featured-actions">
            <span class="btn btn-navy">Request Private Tour</span>
            ${phone ? `<span class="btn btn-outline">Call ${esc(phone)}</span>` : ''}
          </div>
        </div>
      </a>`;
    }

    return `
    <div id="${slug}" class="listing-card rv" data-status="${sStatus}" data-neighborhood="${sNeighborhood}" data-price="${l.price || 0}" data-sqft="${l.sqft || 0}">
      <div class="listing-photo">
        ${photoHtml}
        <span class="listing-status ${statusClass(status)}">${esc(status)}</span>
      </div>
      <div class="listing-body">
        <div class="listing-price-wrap">
          <span class="listing-price-label">${l.price ? 'List Price' : 'Pricing'}</span>
          <div class="listing-price">${priceStr}</div>
        </div>
        <div class="listing-address">${esc(l.address || '')}${l.neighborhood ? `<br><span class="muted">${esc(l.neighborhood)}</span>` : ''}</div>
        <div class="listing-meta">
          ${l.beds ? `<span>${icon('bed', 16, TOKENS.gold)} ${esc(String(l.beds))} bd</span>` : ''}
          ${l.baths ? `<span>${icon('bath', 16, TOKENS.gold)} ${esc(String(l.baths))} ba</span>` : ''}
          ${l.sqft ? `<span>${icon('ruler', 16, TOKENS.gold)} ${esc(Number(l.sqft).toLocaleString())} sqft</span>` : ''}
        </div>
        <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">
          <a href="/contact?property=${encodeURIComponent(l.address || '')}" class="btn btn-navy btn-sm">Request Tour</a>
          ${phone ? `<a href="tel:${esc(tel)}" class="btn btn-text">Call ${esc(phone)}</a>` : ''}
        </div>
      </div>
    </div>`;
  };

  const listingsGrid = `
    <div class="listings-grid">
      ${renderCard(listings[featuredIdx], 'featured')}
      ${listings.map((l, i) => (i === featuredIdx ? '' : renderCard(l, 'card'))).join('')}
    </div>`;

  // ─── Curation process (Tier 3 #9) — between sort bar and grid ────────────
  const curationProcess = `
    <div class="curation-process rv">
      <div class="curation-header">
        <div>
          <span class="eyebrow">How I Find the Right Home</span>
          <h4>Curation, not catalog.</h4>
        </div>
      </div>
      <div class="curation-steps">
        <div class="curation-step">
          <span class="curation-num">01</span>
          <h5>Understand</h5>
          <p>We start with what you actually want, not a search radius. Budget, timeline, must-haves, and the quiet constraints most agents never ask about.</p>
        </div>
        <div class="curation-step">
          <span class="curation-num">02</span>
          <h5>Curate</h5>
          <p>I filter MLS + off-market into the five or six homes that truly fit — including listings your algorithm will never surface. You only spend a weekend on homes worth visiting.</p>
        </div>
        <div class="curation-step">
          <span class="curation-num">03</span>
          <h5>Negotiate</h5>
          <p>A strategic offer built around the seller&apos;s motivations, not the list price. Every contingency explained. I push back when pushing back saves you money.</p>
        </div>
      </div>
    </div>`;

  // ─── See-more contextual CTA (Tier 3 #11) — after the grid ──────────────
  const offMarketCount = Math.max(6, Math.round(listings.length * 1.5));
  const seeMoreBar = `
    <div class="see-more-bar rv">
      <div class="sm-copy">
        <span class="sm-eyebrow">Want to see everything?</span>
        <div class="sm-line">${offMarketCount}+ off-market properties shared only with clients.</div>
        <span class="sm-sub">Including pre-MLS listings, pocket deals, and "coming soon" inventory.</span>
      </div>
      <a class="btn btn-gold" href="/contact">Schedule a Call</a>
    </div>`;

  // ─── Recently Sold strip (Tier 3 #10) — conditional on real data ────────
  const recentSales = Array.isArray(c.recentSales) ? c.recentSales.slice(0, 4) : [];
  const soldSection = recentSales.length ? `
    <section class="sold-section">
      <div class="ctn">
        <div class="sold-header rv">
          <div>
            <span class="eyebrow">Track Record</span>
            <h3>Recently Sold</h3>
          </div>
          <span class="sold-note">Homes I&apos;ve recently closed across ${city ? esc(city) + '\u2019s' : 'the area\u2019s'} best neighborhoods.</span>
        </div>
        <div class="sold-grid">
          ${recentSales.map((s) => `
            <div class="sold-card rv">
              <span class="sold-ribbon">Sold</span>
              <div class="sold-addr">${esc(s.address || '')}</div>
              ${s.neighborhood ? `<div class="sold-neigh">${esc(s.neighborhood)}${s.soldOn ? ` &middot; ${esc(s.soldOn)}` : ''}</div>` : (s.soldOn ? `<div class="sold-neigh">${esc(s.soldOn)}</div>` : '')}
              <div class="sold-price-wrap">
                <span class="sold-price-label">Sold for</span>
                <div class="sold-price">${s.price ? esc(fmtMoney(s.price)) : '—'}</div>
              </div>
              ${(s.beds || s.baths || s.sqft) ? `<div class="sold-meta">
                ${s.beds ? `<span>${esc(String(s.beds))} bd</span>` : ''}
                ${s.baths ? `<span>${esc(String(s.baths))} ba</span>` : ''}
                ${s.sqft ? `<span>${esc(Number(s.sqft).toLocaleString())} sqft</span>` : ''}
              </div>` : ''}
            </div>`).join('')}
        </div>
      </div>
    </section>` : '';

  const ctaSection = `
    <section class="sect sect-cream">
      <div class="ctn" style="text-align:center;max-width:680px">
        <div class="rv">
          <span class="eyebrow">Don&apos;t see what you&apos;re looking for?</span>
          <h2 class="h2" style="margin-top:14px">Let&apos;s talk about what you actually want.</h2>
          <span class="bar-accent"></span>
          <p class="body-lg" style="margin-top:24px">Most of my best deals never make it to public listings. Tell me what you&apos;re after — I&apos;ll match you to the right home, on or off market.</p>
          <div style="margin-top:32px;display:flex;gap:14px;justify-content:center;flex-wrap:wrap">
            <a href="/contact" class="btn btn-gold">Schedule a Call</a>
            ${phone ? `<a href="tel:${esc(tel)}" class="btn btn-outline">Call ${esc(phone)}</a>` : ''}
          </div>
        </div>
      </div>
    </section>`;

  const body = hero + `
    <section class="sect" style="padding-top:48px">
      <div class="ctn">
        ${mlsBanner}
        ${filterChips}
        ${sortBar}
        ${curationProcess}
        ${listingsGrid}
        ${seeMoreBar}
      </div>
    </section>
  ` + soldSection + ctaSection;

  return wrapRealEstatePage(c, '/listings', body, {
    title: `Listings${city ? ` in ${city}` : ''} | ${c.businessName}`,
    description: `Browse current real estate listings${city ? ` in ${city}` : ''} from ${c.businessName}. ${listings.length} properties featured. Live MLS access available on request.`,
    schemas: [getRealEstateAgentSchema(c)],
  });
}

module.exports = { generateListingsPage };
