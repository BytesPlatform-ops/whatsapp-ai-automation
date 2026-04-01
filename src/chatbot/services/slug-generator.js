const { clientIdExists } = require('../db/clients');

/**
 * Generate a URL-safe slug from a business name.
 * e.g. "Dr. Ahmed's Dental" -> "dr-ahmeds-dental"
 */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[']/g, '')           // Remove apostrophes
    .replace(/[^a-z0-9]+/g, '-')   // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '')       // Trim leading/trailing hyphens
    .replace(/-{2,}/g, '-');       // Collapse multiple hyphens
}

/**
 * Generate a unique client_id slug, appending a number if taken.
 */
async function generateUniqueSlug(businessName) {
  const base = slugify(businessName);
  if (!base) throw new Error('Cannot generate slug from empty business name');

  // Try the base slug first
  if (!(await clientIdExists(base))) return base;

  // Append incrementing numbers
  for (let i = 2; i <= 99; i++) {
    const candidate = `${base}-${i}`;
    if (!(await clientIdExists(candidate))) return candidate;
  }

  // Fallback: append random suffix
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

module.exports = { slugify, generateUniqueSlug };
