const { sanitizeSiteConfig } = require('./src/website-gen/sanitizeConfig');
const { applyCsp, applyCspToFiles, collectInlineScriptHashes, buildPolicy } = require('./src/website-gen/csp');

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) pass++;
  else { fail++; console.log(`FAIL: ${name} → got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`); }
}

// ── sanitizeSiteConfig: deep-sanitization ──────────────────────────────
const dirty = {
  businessName: 'Bytes <script>alert(1)</script> Platform',
  tagline: 'normal tagline',
  logoUrl: 'javascript:alert(1)',         // bad URL → null
  bookingUrl: 'https://calendly.com/x',  // good URL → preserved
  paymentLinkUrl: 'http://10.0.0.5/pay', // private IP → null after validateUrl
  contactEmail: 'foo@bar.com',
  services: [
    {
      title: 'Service A',
      fullDescription: 'Description with <script>x</script> tag',
      image: { url: 'http://127.0.0.1/img', alt: 'inner' },
    },
  ],
  testimonials: [
    { quote: 'Great <iframe src=x></iframe>!', name: 'Jane' },
  ],
  templateId: 'business-starter',
  yearsExperience: 12,
  paymentStatus: 'preview',
};

const cleaned = sanitizeSiteConfig(dirty);
check('businessName stripped script', /script/i.test(cleaned.businessName), false);
check('businessName preserved word "Platform"', cleaned.businessName.includes('Platform'), true);
check('tagline untouched', cleaned.tagline, 'normal tagline');
check('logoUrl javascript: → null', cleaned.logoUrl, null);
check('bookingUrl preserved', cleaned.bookingUrl, 'https://calendly.com/x');
check('paymentLinkUrl private → null', cleaned.paymentLinkUrl, null);
check('services[0].fullDescription stripped', /script/i.test(cleaned.services[0].fullDescription), false);
check('services[0].image.url private → null', cleaned.services[0].image.url, null);
check('testimonials[0].quote stripped', /<iframe/i.test(cleaned.testimonials[0].quote), false);
check('templateId preserved', cleaned.templateId, 'business-starter');
check('yearsExperience preserved (number)', cleaned.yearsExperience, 12);

// ── CSP hash collection ─────────────────────────────────────────────────
const sampleHtml = `<!DOCTYPE html><html><head><title>Test</title></head><body>
<script>console.log('hello');</script>
<script src="https://cdn.tailwindcss.com"></script>
<script>document.querySelectorAll('form').forEach(f => f.addEventListener('submit', e => e.preventDefault()));</script>
</body></html>`;

const hashes = collectInlineScriptHashes(sampleHtml);
check('two distinct inline scripts hashed', hashes.size, 2);
check('external src= script not hashed', Array.from(hashes).every((h) => h.startsWith("'sha256-")), true);

// Identical inline scripts should dedupe.
const dupHtml = `<head></head><body><script>x</script><script>x</script></body>`;
check('identical inline scripts dedupe', collectInlineScriptHashes(dupHtml).size, 1);

// ── applyCsp: meta tag injection ────────────────────────────────────────
const cspHtml = applyCsp(sampleHtml);
check('meta tag inserted', /content-security-policy/i.test(cspHtml), true);
check('script-src contains tailwind cdn', /script-src[^;]*cdn\.tailwindcss\.com/i.test(cspHtml), true);
check('script-src contains sha256 hashes', /script-src[^;]*'sha256-/i.test(cspHtml), true);
check('original script bodies preserved', /console\.log\('hello'\)/.test(cspHtml), true);
check('frame-ancestors none', /frame-ancestors 'none'/.test(cspHtml), true);

// Non-HTML files pass through.
const nonHtml = applyCsp('body { color: red }');
check('non-HTML untouched', nonHtml, 'body { color: red }');

// applyCspToFiles preserves non-html files.
const fileMap = applyCspToFiles({
  '/index.html': sampleHtml,
  '/styles.css': 'body { color: red }',
  '/data.json': '{"x":1}',
});
check('html file got CSP', /content-security-policy/i.test(fileMap['/index.html']), true);
check('css file untouched', fileMap['/styles.css'], 'body { color: red }');
check('json file untouched', fileMap['/data.json'], '{"x":1}');

// Edge: HTML with no <head> shouldn't break — but applyCsp checks for head before injecting.
const noHeadHtml = '<body>hi</body>';
check('no-head HTML passes through', applyCsp(noHeadHtml), noHeadHtml);

// Policy builder shape
const policy = buildPolicy(new Set(["'sha256-abc'"]));
check('policy includes sha256', policy.includes("'sha256-abc'"), true);
check('policy ends with object-src none', /object-src 'none'/.test(policy), true);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail > 0 ? 1 : 0);
