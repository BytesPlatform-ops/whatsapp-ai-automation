'use strict';

// Download + decrypt media uploaded through a WhatsApp Flow PhotoPicker /
// DocumentPicker.
//
// When a screen with a PhotoPicker submits via data_exchange (or complete),
// the picked files arrive in the screen's payload as descriptors — NOT the
// bytes. Each descriptor points at an encrypted blob on WhatsApp's CDN plus
// the keys to decrypt it:
//
//   {
//     "cdn_url": "https://...",
//     "file_name": "logo.jpg",
//     "encryption_metadata": {
//       "encryption_key":  "<base64>",   // AES key (direct, no HKDF)
//       "hmac_key":        "<base64>",
//       "iv":              "<base64>",
//       "plaintext_hash":  "<base64 sha256 of decrypted bytes>",
//       "encrypted_hash":  "<base64 sha256 of the CDN blob>"
//     }
//   }
//
// The CDN blob is laid out as `ciphertext || hmac10` (last 10 bytes are the
// truncated HMAC). Verify the encrypted hash, validate the HMAC over
// iv+ciphertext, AES-CBC decrypt, then verify the plaintext hash.
//
// Docs: https://developers.facebook.com/docs/whatsapp/flows/reference/media_upload/

const crypto = require('crypto');
const axios = require('axios');
const { logger } = require('../utils/logger');

const HMAC_TAIL = 10; // truncated HMAC appended to the CDN ciphertext

// Best-effort MIME from the original file name (PhotoPicker is photos).
function mimeFromName(name) {
  const ext = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  switch (ext) {
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'heic': return 'image/heic';
    case 'heif': return 'image/heif';
    case 'jpg':
    case 'jpeg':
    default: return 'image/jpeg';
  }
}

/**
 * Decrypt the raw CDN blob using a descriptor's encryption_metadata. Pure
 * (no network) so it can be unit-tested without hitting the CDN.
 *
 * @param {Buffer} cdnFile  the encrypted bytes downloaded from cdn_url
 * @param {object} meta     encryption_metadata
 * @returns {Buffer} decrypted media bytes
 */
function decryptMediaBytes(cdnFile, meta = {}) {
  const encKey = Buffer.from(meta.encryption_key || '', 'base64');
  const hmacKey = Buffer.from(meta.hmac_key || '', 'base64');
  const iv = Buffer.from(meta.iv || '', 'base64');
  if (!encKey.length || !iv.length) {
    throw new Error('missing encryption_key / iv');
  }

  // 1. SHA256(cdnFile) must equal encrypted_hash (blob not tampered with).
  if (meta.encrypted_hash) {
    const h = crypto.createHash('sha256').update(cdnFile).digest('base64');
    if (h !== meta.encrypted_hash) throw new Error('encrypted_hash mismatch');
  }

  // 2. Split ciphertext + 10-byte HMAC; validate HMAC over iv+ciphertext.
  if (cdnFile.length <= HMAC_TAIL) throw new Error('cdn blob too short');
  const cipherText = cdnFile.subarray(0, cdnFile.length - HMAC_TAIL);
  const hmac10 = cdnFile.subarray(cdnFile.length - HMAC_TAIL);
  if (hmacKey.length) {
    const mac = crypto.createHmac('sha256', hmacKey).update(iv).update(cipherText).digest();
    if (Buffer.compare(hmac10, mac.subarray(0, HMAC_TAIL)) !== 0) {
      throw new Error('HMAC validation failed');
    }
  }

  // 3. AES-CBC decrypt (key length picks 128/256).
  const algorithm = `aes-${encKey.length * 8}-cbc`;
  const decipher = crypto.createDecipheriv(algorithm, encKey, iv);
  const plain = Buffer.concat([decipher.update(cipherText), decipher.final()]);

  // 4. SHA256(plain) must equal plaintext_hash.
  if (meta.plaintext_hash) {
    const h = crypto.createHash('sha256').update(plain).digest('base64');
    if (h !== meta.plaintext_hash) throw new Error('plaintext_hash mismatch');
  }

  return plain;
}

/**
 * Download a Flow media descriptor from the CDN and decrypt it.
 *
 * @param {object} media  a single PhotoPicker/DocumentPicker descriptor
 * @returns {Promise<{buffer:Buffer, mimeType:string, fileName:string}>}
 */
async function decryptFlowMedia(media) {
  const cdnUrl = media?.cdn_url;
  const meta = media?.encryption_metadata;
  if (!cdnUrl || !meta) throw new Error('media descriptor missing cdn_url / encryption_metadata');

  const resp = await axios.get(cdnUrl, { responseType: 'arraybuffer', timeout: 20000 });
  const cdnFile = Buffer.from(resp.data);
  const buffer = decryptMediaBytes(cdnFile, meta);

  logger.info(`[FLOW-MEDIA] decrypted ${media.file_name || 'media'} (${buffer.length} bytes)`);
  return { buffer, mimeType: mimeFromName(media.file_name), fileName: media.file_name || '' };
}

module.exports = { decryptFlowMedia, decryptMediaBytes, mimeFromName };
