/**
 * Pixie bridge — render a siteConfig into HTML pages using the EXISTING Node
 * website-gen templates (src/website-gen). Reuses the previous developer's
 * production templates instead of re-implementing them in Python.
 *
 * I/O: reads a JSON siteConfig from stdin, writes {ok, files} (or {ok:false,
 * error}) to stdout. `files` is a map { "/index.html": "<html>", ... }.
 *
 * This is the RENDER path only (config -> HTML) — no LLM, no Pexels, no Netlify,
 * so it runs with no API keys. Content generation (generateWebsiteContent) and
 * deploy (deployToNetlify) are separate and need keys.
 */
// Silence dotenv's stdout banner (it would corrupt our JSON on stdout).
process.env.DOTENV_CONFIG_QUIET = 'true';

const path = require('path');

// All real output is prefixed with this sentinel so the Python side can ignore
// any stray banners/logs that libraries print to stdout before us.
const SENTINEL = '<<<PIXIE_JSON>>>';

const SRC = path.resolve(__dirname, '..', '..', 'src', 'website-gen');
const { pickTemplate } = require(path.join(SRC, 'templates'));
const salon = require(path.join(SRC, 'templates', 'salon'));

function render(config) {
  const watermark = Boolean(config.watermark);
  // Salon takes a boolean watermark; niche templates take { watermark }.
  if (config.templateId === 'salon') {
    return salon.generateAllPages(config, watermark);
  }
  const tpl = pickTemplate(config.industry || '');
  if (tpl && typeof tpl.generateAllPages === 'function') {
    return tpl.generateAllPages(config, { watermark });
  }
  throw new Error(
    "No niche template matched (use industry like 'hvac', 'real estate', 'photographer', or templateId 'salon'). " +
    "Generic template lives in deployer.js and isn't exported yet."
  );
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  try {
    const config = JSON.parse(raw || '{}');
    const files = render(config);
    process.stdout.write(SENTINEL + JSON.stringify({ ok: true, pages: Object.keys(files), files }));
  } catch (e) {
    process.stdout.write(SENTINEL + JSON.stringify({ ok: false, error: (e && e.message) || String(e) }));
    process.exitCode = 1;
  }
});
