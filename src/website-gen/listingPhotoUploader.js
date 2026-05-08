// Image uploader for user-supplied photos that need a stable public URL the
// generated site can reference. Originally written for real-estate listing
// photos (default bucket: `listing-photos`); now parameterized so the
// services-form salon flow can reuse it for `salon-service-photos`.

const { supabase } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { assertImageBytesSafe } = require('../utils/validators');

const DEFAULT_BUCKET = 'listing-photos';
const DEFAULT_TAG = 'LISTING-UPLOAD';
const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;

async function ensureBucket(bucket, tag) {
  const { error } = await supabase.storage.createBucket(bucket, {
    public: true,
    allowedMimeTypes: ALLOWED_MIMES,
    fileSizeLimit: MAX_BYTES,
  });
  if (error && !error.message?.toLowerCase().includes('already exists')) {
    logger.warn(`[${tag}] Bucket setup warning: ${error.message}`);
  }
}

/**
 * Upload a buffer (e.g. from WhatsApp downloadMedia, or multipart form input)
 * to Supabase Storage and return its public URL.
 *
 * @param {Buffer} buffer
 * @param {string} mimeType  - e.g. "image/jpeg"
 * @param {object} [opts]
 * @param {string} [opts.bucket]  - Supabase storage bucket name (default: 'listing-photos')
 * @param {string} [opts.tag]     - Log prefix tag (default: 'LISTING-UPLOAD')
 * @returns {Promise<string>} public URL
 */
async function uploadListingPhoto(buffer, mimeType = 'image/jpeg', opts = {}) {
  const bucket = opts.bucket || DEFAULT_BUCKET;
  const tag = opts.tag || DEFAULT_TAG;

  await ensureBucket(bucket, tag);

  // Bucket allowedMimeTypes is only enforced at creation; re-validate here.
  const safety = assertImageBytesSafe(buffer, mimeType, ALLOWED_MIMES);
  if (!safety.ok) {
    logger.warn(`[${tag}] Rejected upload (${safety.reason}, mime=${mimeType})`);
    throw new Error(`Photo upload rejected: ${safety.reason}`);
  }

  const ext = (mimeType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const filename = `${Date.now()}-${uuidv4().slice(0, 8)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filename, buffer, {
      contentType: mimeType,
      upsert: false,
      cacheControl: '3600',
    });
  if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`);

  const { data } = supabase.storage.from(bucket).getPublicUrl(filename);
  logger.info(`[${tag}] Uploaded: ${data.publicUrl}`);
  return data.publicUrl;
}

module.exports = { uploadListingPhoto };
