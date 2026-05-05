// Normalize a business name for storage / display.
//
// Title-cases each word, with a small acronym set kept fully uppercase
// (HVAC, LLC, etc.). Leaves intentional mixed-case tokens alone
// ("iPhone", "MacDonalds") so we don't mangle a name the user
// deliberately styled.
//
// Why this lives in its own module: businessName gets persisted from
// many sites — handleCollectName simple-path, the LLM extractor in
// entityAccumulator, the side-channel name_change branch, the
// confirm-step edit handler, and the salesBot first-message extractor.
// Funneling them all through one helper means one source of truth for
// casing rules.

const ACRONYMS = new Set([
  'HVAC', 'AC',
  'LLC', 'LLP', 'INC', 'CORP', 'CO', 'LTD',
  'IT', 'HR', 'PR', 'UI', 'UX', 'SEO', 'CRM',
  'NYC', 'USA', 'UK', 'UAE', 'EU',
  'BBQ', 'DJ',
]);

function normalizeBusinessName(raw) {
  const s = String(raw || '').trim();
  if (!s) return s;
  return s
    .split(/\s+/)
    .map((w) => {
      if (!w) return w;
      // Preserve intentional mixed case ("iPhone", "MacBook"): a token
      // with a lowercase letter AND an uppercase letter past index 0
      // was almost certainly styled on purpose.
      const hasLower = /[a-z]/.test(w);
      const upperPastStart = /[A-Z]/.test(w.slice(1));
      if (hasLower && upperPastStart) return w;
      const lettersOnlyUpper = w.replace(/[^A-Za-z]/g, '').toUpperCase();
      if (lettersOnlyUpper && ACRONYMS.has(lettersOnlyUpper)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

module.exports = { normalizeBusinessName };
