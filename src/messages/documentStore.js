'use strict';

// Stores inbound chat documents (PDF / DOCX / TXT …) so the admin conversation
// view can open them. Documents often carry PII (a resume has name, phone,
// email, address, work history), so they go in a PRIVATE Supabase bucket and
// are served via short-lived SIGNED URLs minted on demand by the auth-gated
// admin API — never a public, anyone-with-link URL.
//
// The message row stores a "sbdoc:<path>" sentinel in media_data (NOT a usable
// URL). signDocumentUrl() turns that sentinel into a time-limited signed URL;
// the admin conversation API calls it just before returning messages. Mirrors
// listingPhotoUploader but for arbitrary file types (no image processing).
// Returns null on any failure (the conversation then just shows the filename).

const { supabase } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');

const BUCKET = 'chat-documents';
const TAG = 'DOC-STORE';
const MAX_BYTES = 20 * 1024 * 1024;
const SENTINEL = 'sbdoc:'; // media_data prefix marking a private signed-on-read doc
const SIGNED_TTL_SECONDS = 60 * 60; // 1h — refreshed each time the admin opens the chat
const ALLOWED_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

async function ensureBucket() {
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: false,
    allowedMimeTypes: ALLOWED_MIMES,
    fileSizeLimit: MAX_BYTES,
  });
  if (error && !error.message?.toLowerCase().includes('already exists')) {
    logger.warn(`[${TAG}] Bucket setup warning: ${error.message}`);
  }
}

// Sanitise a user-supplied filename to a safe storage path segment.
function safeBase(name) {
  return (String(name || 'document')
    .replace(/\.[a-z0-9]{1,6}$/i, '')      // drop extension (re-added from mime)
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 60)) || 'document';
}

function extFor(mimeType, filename) {
  const fromName = String(filename || '').match(/\.([a-z0-9]{1,6})$/i);
  if (fromName) return fromName[1].toLowerCase();
  const map = {
    'application/pdf': 'pdf',
    'text/plain': 'txt',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  };
  return map[String(mimeType || '').toLowerCase()] || 'bin';
}

/**
 * Upload an inbound document buffer to the PRIVATE bucket and return a
 * "sbdoc:<path>" sentinel to store in the message's media_data, or null on
 * failure. The sentinel is not a usable URL — call signDocumentUrl() to mint a
 * short-lived signed URL when actually serving it to the admin.
 *
 * @param {Buffer} buffer
 * @param {string} mimeType  e.g. "application/pdf"
 * @param {string} [filename]
 * @returns {Promise<string|null>}  "sbdoc:<path>" or null
 */
async function uploadInboundDocument(buffer, mimeType, filename) {
  if (!buffer || !buffer.length) return null;
  if (buffer.length > MAX_BYTES) {
    logger.warn(`[${TAG}] document too large (${buffer.length} bytes) — skipping store`);
    return null;
  }
  try {
    await ensureBucket();
    const ext = extFor(mimeType, filename);
    const path = `${Date.now()}-${uuidv4().slice(0, 8)}-${safeBase(filename)}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType: mimeType || 'application/octet-stream',
      upsert: false,
      cacheControl: '3600',
    });
    if (error) { logger.warn(`[${TAG}] upload failed: ${error.message}`); return null; }
    logger.info(`[${TAG}] stored ${path} (private)`);
    return SENTINEL + path;
  } catch (err) {
    logger.warn(`[${TAG}] store error: ${err.message}`);
    return null;
  }
}

/**
 * Turn a stored "sbdoc:<path>" sentinel into a short-lived signed URL the admin
 * browser can open. Returns the original value unchanged if it isn't a sentinel
 * (so callers can map over mixed media_data safely), or null if signing fails.
 *
 * @param {string} value  media_data from a message row
 * @returns {Promise<string|null>}
 */
async function signDocumentUrl(value) {
  const v = String(value || '');
  if (!v.startsWith(SENTINEL)) return value; // not a private-doc sentinel
  const path = v.slice(SENTINEL.length);
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL_SECONDS);
    if (error || !data?.signedUrl) {
      logger.warn(`[${TAG}] sign failed for ${path}: ${error?.message || 'no url'}`);
      return null;
    }
    return data.signedUrl;
  } catch (err) {
    logger.warn(`[${TAG}] sign error: ${err.message}`);
    return null;
  }
}

function isDocumentSentinel(value) {
  return typeof value === 'string' && value.startsWith(SENTINEL);
}

module.exports = { uploadInboundDocument, signDocumentUrl, isDocumentSentinel, SENTINEL };
