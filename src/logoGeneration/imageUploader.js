/**
 * Logo Image Uploader
 *
 * Uploads a base64-encoded logo image to Supabase Storage (bucket: logo-images)
 * and returns a public URL suitable for WhatsApp's sendImage() call.
 *
 * Separated from the ad-images bucket for clean storage organization.
 */

const { supabase } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');

const BUCKET = 'logo-images';

/**
 * Ensure the logo-images bucket exists and is public.
 * Silently ignores "already exists" errors.
 */
async function ensureBucket() {
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    fileSizeLimit: 10 * 1024 * 1024, // 10 MB
  });

  if (error && !error.message?.toLowerCase().includes('already exists')) {
    logger.warn(`[LOGO-UPLOAD] Bucket setup warning: ${error.message}`);
  }
}

/**
 * Upload a base64 logo image to Supabase Storage.
 *
 * @param {string} base64Data - Raw base64 string (NO "data:..." prefix)
 * @param {string} mimeType   - e.g. "image/png"
 * @returns {Promise<string>} - Public URL of the uploaded logo
 */
async function uploadLogoImage(base64Data, mimeType = 'image/png') {
  await ensureBucket();

  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
  const filename = `${Date.now()}-${uuidv4().slice(0, 8)}.${ext}`;
  const buffer = Buffer.from(base64Data, 'base64');

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filename, buffer, {
      contentType: mimeType,
      upsert: false,
      cacheControl: '3600',
    });

  if (uploadError) {
    throw new Error(`Logo upload failed: ${uploadError.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);

  logger.info(`[LOGO-UPLOAD] Uploaded: ${data.publicUrl}`);
  return data.publicUrl;
}

module.exports = { uploadLogoImage };
