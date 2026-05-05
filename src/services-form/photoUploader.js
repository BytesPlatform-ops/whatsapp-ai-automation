// Salon service photo uploader — receives a buffer (from the multipart
// form upload) and uploads it to Supabase Storage so the generated salon
// site can reference a public URL. Mirrors listingPhotoUploader.js.

const { supabase } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { assertImageBytesSafe } = require('../utils/validators');

const BUCKET = 'salon-service-photos';
const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp'];

async function ensureBucket() {
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: ALLOWED_MIMES,
    fileSizeLimit: 10 * 1024 * 1024,
  });
  if (error && !error.message?.toLowerCase().includes('already exists')) {
    logger.warn(`[SALON-PHOTO-UPLOAD] Bucket setup warning: ${error.message}`);
  }
}

async function uploadSalonServicePhoto(buffer, mimeType = 'image/jpeg') {
  await ensureBucket();
  const safety = assertImageBytesSafe(buffer, mimeType, ALLOWED_MIMES);
  if (!safety.ok) {
    logger.warn(`[SALON-PHOTO-UPLOAD] Rejected (${safety.reason}, mime=${mimeType})`);
    throw new Error(`Salon photo upload rejected: ${safety.reason}`);
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
  if (uploadError) throw new Error(`Salon photo upload failed: ${uploadError.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  logger.info(`[SALON-PHOTO-UPLOAD] Uploaded: ${data.publicUrl}`);
  return data.publicUrl;
}

module.exports = { uploadSalonServicePhoto };
