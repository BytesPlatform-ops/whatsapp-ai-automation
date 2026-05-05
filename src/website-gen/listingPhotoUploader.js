// Listing photo uploader — receives a buffer (downloaded from WhatsApp via
// downloadMedia) and uploads it to Supabase Storage so the generated site
// can reference a public URL. Mirrors the ad-images pattern.

const { supabase } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { assertImageBytesSafe } = require('../utils/validators');

const BUCKET = 'listing-photos';
const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp'];

async function ensureBucket() {
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    fileSizeLimit: 10 * 1024 * 1024,
  });
  if (error && !error.message?.toLowerCase().includes('already exists')) {
    logger.warn(`[LISTING-UPLOAD] Bucket setup warning: ${error.message}`);
  }
}

/**
 * Upload a buffer (e.g. from WhatsApp downloadMedia) to Supabase Storage.
 * @param {Buffer} buffer
 * @param {string} mimeType - e.g. "image/jpeg"
 * @returns {Promise<string>} public URL
 */
async function uploadListingPhoto(buffer, mimeType = 'image/jpeg') {
  await ensureBucket();

  // Bucket allowedMimeTypes is only enforced at creation; re-validate here.
  const safety = assertImageBytesSafe(buffer, mimeType, ALLOWED_MIMES);
  if (!safety.ok) {
    logger.warn(`[LISTING-UPLOAD] Rejected upload (${safety.reason}, mime=${mimeType})`);
    throw new Error(`Listing photo upload rejected: ${safety.reason}`);
  }

  const ext = (mimeType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const filename = `${Date.now()}-${uuidv4().slice(0, 8)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filename, buffer, {
      contentType: mimeType,
      upsert: false,
      cacheControl: '3600',
    });
  if (uploadError) throw new Error(`Listing photo upload failed: ${uploadError.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  logger.info(`[LISTING-UPLOAD] Uploaded: ${data.publicUrl}`);
  return data.publicUrl;
}

module.exports = { uploadListingPhoto };
