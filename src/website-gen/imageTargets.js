/**
 * Image-target taxonomy for revisions.
 *
 * Sites built from any of our 4 templates (HVAC/trades, salon, real estate,
 * generic-fallback-which-is-HVAC) expose different image fields. The revision
 * flow needs a single language for "the user wants to change THIS image" so
 * that:
 *   - text revisions can express which image they're talking about,
 *   - image uploads can be routed to the right slot,
 *   - and the bot can ask "which one?" with a stable list of options.
 *
 * Target IDs are short, button-id-safe strings:
 *   - hero
 *   - logo
 *   - agent
 *   - service:N           (HVAC services[N] OR Salon salonServices[N])
 *   - listing:N           (Real Estate featuredListings[N])
 *   - neighborhood:NAME   (Real Estate neighborhoodImages[NAME])
 *
 * Image shape passed to applyImageToTarget:
 *   { url, photographer?, photographerUrl?, sourceUrl?, dominantColor?, source? }
 * For the logo target only `image.url` is read (logo is stored as a string).
 */

/**
 * List every addressable image slot in this config, in display order. Used
 * by the bot when it has to ask "where should I put this?" and by the LLM
 * caption classifier as the closed set of valid targets.
 *
 * Returned items: { id, label, currentUrl }
 *   id          — stable target id used by applyImageToTarget()
 *   label       — short human label for buttons / list rows ("Service: Plumbing")
 *   currentUrl  — what's there today, or null. Useful for "the empty ones"
 *                 heuristics later.
 */
function getAvailableTargets(c) {
  const targets = [];
  if (!c || typeof c !== 'object') return targets;

  // Hero — every template has one.
  targets.push({
    id: 'hero',
    label: 'Homepage hero photo',
    currentUrl: c.heroImage?.url || null,
  });

  // Logo — every template. Stored as a string URL on c.logoUrl.
  targets.push({
    id: 'logo',
    label: 'Logo',
    currentUrl: c.logoUrl || null,
  });

  // HVAC / trades / generic services use { title, image }.
  if (Array.isArray(c.services)) {
    c.services.forEach((s, i) => {
      const name = s?.title || s?.name || `Service ${i + 1}`;
      targets.push({
        id: `service:${i}`,
        label: `Service: ${name}`,
        currentUrl: s?.image?.url || null,
      });
    });
  }

  // Salon services use { name, image }. We use the same `service:N` namespace
  // because no single config carries BOTH `services` and `salonServices` —
  // the template router picks one or the other.
  if (Array.isArray(c.salonServices)) {
    c.salonServices.forEach((s, i) => {
      const name = s?.name || s?.title || `Service ${i + 1}`;
      targets.push({
        id: `service:${i}`,
        label: `Service: ${name}`,
        currentUrl: s?.image?.url || null,
      });
    });
  }

  // Real Estate — featured listings.
  if (Array.isArray(c.featuredListings)) {
    c.featuredListings.forEach((l, i) => {
      const name = l?.address || l?.title || `Listing ${i + 1}`;
      targets.push({
        id: `listing:${i}`,
        label: `Listing: ${name}`,
        currentUrl: l?.image?.url || null,
      });
    });
  }

  // Real Estate — agent headshot. Field is sometimes pre-seeded as null,
  // sometimes a full object, so we check via `in` to surface it either way.
  if ('agentPlaceholderImage' in c) {
    targets.push({
      id: 'agent',
      label: 'Agent headshot',
      currentUrl: c.agentPlaceholderImage?.url || null,
    });
  }

  // Real Estate — per-neighborhood photos. Keyed by area name (string).
  if (c.neighborhoodImages && typeof c.neighborhoodImages === 'object') {
    Object.keys(c.neighborhoodImages).forEach((name) => {
      targets.push({
        id: `neighborhood:${name}`,
        label: `Neighborhood: ${name}`,
        currentUrl: c.neighborhoodImages[name]?.url || null,
      });
    });
  }

  return targets;
}

/**
 * Return a NEW config with the image written into the slot identified by
 * targetId. Unknown targets return the config unchanged so callers don't
 * silently corrupt the site.
 *
 * `image` is normally `{ url, photographer?, dominantColor?, source? }`.
 * For the logo target, only `image.url` is used (logo is a bare string).
 */
function applyImageToTarget(c, targetId, image) {
  if (!c || !targetId || !image?.url) return c;

  if (targetId === 'hero') {
    return { ...c, heroImage: image };
  }

  if (targetId === 'logo') {
    return { ...c, logoUrl: image.url };
  }

  if (targetId === 'agent') {
    return { ...c, agentPlaceholderImage: image };
  }

  if (targetId.startsWith('service:')) {
    const idx = parseInt(targetId.slice('service:'.length), 10);
    if (!Number.isInteger(idx) || idx < 0) return c;
    const next = { ...c };
    if (Array.isArray(c.services) && c.services[idx]) {
      next.services = c.services.slice();
      next.services[idx] = { ...next.services[idx], image };
      return next;
    }
    if (Array.isArray(c.salonServices) && c.salonServices[idx]) {
      next.salonServices = c.salonServices.slice();
      next.salonServices[idx] = { ...next.salonServices[idx], image };
      return next;
    }
    return c;
  }

  if (targetId.startsWith('listing:')) {
    const idx = parseInt(targetId.slice('listing:'.length), 10);
    if (!Number.isInteger(idx) || idx < 0) return c;
    if (!Array.isArray(c.featuredListings) || !c.featuredListings[idx]) return c;
    const next = { ...c, featuredListings: c.featuredListings.slice() };
    next.featuredListings[idx] = { ...next.featuredListings[idx], image };
    return next;
  }

  if (targetId.startsWith('neighborhood:')) {
    const name = targetId.slice('neighborhood:'.length);
    if (!name) return c;
    return {
      ...c,
      neighborhoodImages: { ...(c.neighborhoodImages || {}), [name]: image },
    };
  }

  return c;
}

/**
 * One-line summary of a target for use in confirmation messages
 * ("Done — your image is live as the homepage hero.").
 */
function describeTarget(targetId, c) {
  const t = getAvailableTargets(c).find((x) => x.id === targetId);
  return t?.label || targetId;
}

module.exports = { getAvailableTargets, applyImageToTarget, describeTarget };
