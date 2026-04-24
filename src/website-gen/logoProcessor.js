// Logo processor — takes a raw image buffer (the user's WhatsApp upload)
// and returns a public URL of a transparent-background PNG suitable for
// placement in a generated site's navigation.
//
// Cascade:
//   Tier 1: Already transparent PNG?  → upload as-is, skip API.
//   Tier 2: Call remove.bg             → upload stripped result.
//   Fallback: API missing / error      → upload original, caller decides
//                                        whether to still use it.
//
// The alpha-channel check reads the PNG's IHDR chunk directly so we don't
// need to pull in a whole imaging dependency (sharp, jimp). JPEGs have no
// alpha channel so they always go to Tier 2.

const axios = require('axios');
const FormData = require('form-data');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { uploadLogoImage } = require('../logoGeneration/imageUploader');

const REMOVE_BG_URL = 'https://api.remove.bg/v1.0/removebg';
const MAX_API_TIMEOUT_MS = 30000;

/**
 * Inspect a PNG buffer's IHDR chunk to see if the pixels include an alpha
 * channel. Returns false for anything that isn't a PNG (JPEG, WebP, etc.)
 * since those have no built-in alpha semantics we can cheaply detect.
 *
 * PNG layout: 8-byte signature → IHDR chunk at offset 8 with the color
 * type at byte 25. Color types 4 (grey+alpha) and 6 (RGBA) carry alpha.
 */
function pngHasAlphaChannel(buffer) {
  if (!buffer || buffer.length < 26) return false;
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  const sig = buffer.slice(0, 8);
  const isPng =
    sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47 &&
    sig[4] === 0x0d && sig[5] === 0x0a && sig[6] === 0x1a && sig[7] === 0x0a;
  if (!isPng) return false;
  const colorType = buffer[25];
  return colorType === 4 || colorType === 6;
}

/**
 * Call remove.bg to strip the background. Returns a Buffer of the output
 * PNG on success, or null if the API isn't configured / fails.
 *
 * Parameters chosen for logo use: `size=auto` uses the free-tier preview
 * resolution, which is enough for nav-bar placement. `type=product` tells
 * the model the subject is an object/graphic (better for text-heavy logos
 * than the default "auto" which assumes portraits).
 */
async function callRemoveBg(imageBuffer, mimeType) {
  const apiKey = env.removeBg?.apiKey;
  if (!apiKey) {
    logger.warn('[LOGO-PROC] REMOVE_BG_API_KEY not configured — skipping API step');
    return null;
  }

  const form = new FormData();
  form.append('image_file', imageBuffer, {
    filename: `logo.${mimeType?.split('/')[1]?.replace('jpeg', 'jpg') || 'png'}`,
    contentType: mimeType || 'image/png',
  });
  form.append('size', 'auto');
  form.append('type', 'product');     // better edge handling for logos than 'auto'
  form.append('format', 'png');       // force transparent-capable output

  try {
    const response = await axios.post(REMOVE_BG_URL, form, {
      headers: { ...form.getHeaders(), 'X-Api-Key': apiKey },
      responseType: 'arraybuffer',
      timeout: MAX_API_TIMEOUT_MS,
      // Don't throw on 4xx — we want to inspect the JSON error body
      validateStatus: (s) => s < 500,
    });

    if (response.status !== 200) {
      // remove.bg returns JSON errors (rate-limit, invalid key, etc.)
      const errText = Buffer.from(response.data).toString('utf8');
      logger.warn(`[LOGO-PROC] remove.bg ${response.status}: ${errText.slice(0, 200)}`);
      return null;
    }

    return Buffer.from(response.data);
  } catch (err) {
    logger.error(`[LOGO-PROC] remove.bg request failed: ${err.message}`);
    return null;
  }
}

/**
 * Main entry point. Takes the user's uploaded image, decides whether it
 * needs background removal, uploads the final PNG to Supabase Storage,
 * and returns a URL suitable for embedding in generated-site HTML.
 *
 * @param {Buffer} imageBuffer
 * @param {string} mimeType      - e.g. "image/jpeg" / "image/png"
 * @returns {Promise<{url: string, wasProcessed: boolean, source: 'original'|'remove.bg'}>}
 */
async function processLogo(imageBuffer, mimeType = 'image/png') {
  if (!imageBuffer || !imageBuffer.length) {
    throw new Error('processLogo: empty image buffer');
  }

  // Tier 1 — already transparent PNG: upload verbatim.
  if (pngHasAlphaChannel(imageBuffer)) {
    logger.info('[LOGO-PROC] Upload already has alpha channel — skipping remove.bg');
    const url = await uploadLogoImage(imageBuffer.toString('base64'), 'image/png');
    return { url, wasProcessed: false, source: 'original' };
  }

  // Tier 2 — try remove.bg.
  const stripped = await callRemoveBg(imageBuffer, mimeType);
  if (stripped) {
    logger.info('[LOGO-PROC] remove.bg succeeded — uploading transparent PNG');
    const url = await uploadLogoImage(stripped.toString('base64'), 'image/png');
    return { url, wasProcessed: true, source: 'remove.bg' };
  }

  // Fallback — upload the original. Better than nothing; the nav element
  // will render on top of whatever background the user sent (usually
  // white, which looks fine on a white nav and passable elsewhere).
  logger.warn('[LOGO-PROC] remove.bg unavailable — uploading original image');
  const url = await uploadLogoImage(imageBuffer.toString('base64'), mimeType);
  return { url, wasProcessed: false, source: 'original' };
}

module.exports = { processLogo, pngHasAlphaChannel };
