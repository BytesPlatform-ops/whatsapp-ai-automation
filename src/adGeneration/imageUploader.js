/**
 * Ad Image Uploader
 *
 * Uploads a base64-encoded ad image to Supabase Storage (bucket: ad-images)
 * and returns a public URL suitable for WhatsApp's sendImage() call.
 *
 * The bucket is created automatically on first use if it does not exist.
 */

const { supabase } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');

const BUCKET = 'ad-images';

/**
 * Ensure the ad-images bucket exists and is public.
 * Silently ignores "already exists" errors.
 */
async function ensureBucket() {
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    fileSizeLimit: 10 * 1024 * 1024, // 10 MB
  });

  if (error && !error.message?.toLowerCase().includes('already exists')) {
    // Non-fatal — bucket might exist or permissions differ
    logger.warn(`[AD-UPLOAD] Bucket setup warning: ${error.message}`);
  }
}

/**
 * Upload a base64 image string to Supabase Storage.
 *
 * @param {string} base64Data  - Raw base64 string (NO "data:..." prefix)
 * @param {string} mimeType    - e.g. "image/png"
 * @returns {Promise<string>}  - Public URL of the uploaded image
 */
async function uploadAdImage(base64Data, mimeType = 'image/png') {
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
    throw new Error(`Image upload failed: ${uploadError.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);

  logger.info(`[AD-UPLOAD] Uploaded: ${data.publicUrl}`);
  return data.publicUrl;
}

module.exports = { uploadAdImage };
