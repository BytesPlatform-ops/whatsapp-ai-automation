'use strict';

// Offline regression for src/flows/media.js — proves decryptMediaBytes
// reverses the exact encryption scheme WhatsApp uses for Flow PhotoPicker
// uploads (AES-CBC + truncated HMAC + plaintext/encrypted SHA256 hashes),
// without touching the network.
//
//   node scripts/flows/test-flow-media.js
//
// Exits non-zero on any failure.

const crypto = require('crypto');
const assert = require('assert');
const { decryptMediaBytes } = require('../../src/flows/media');

// Encrypt `plain` the way Meta's client would, returning the CDN blob bytes
// and the encryption_metadata descriptor the Flow payload carries.
function simulateUpload(plain) {
  const encKey = crypto.randomBytes(32); // AES-256
  const hmacKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv('aes-256-cbc', encKey, iv);
  const cipherText = Buffer.concat([cipher.update(plain), cipher.final()]);

  const hmac10 = crypto.createHmac('sha256', hmacKey)
    .update(iv).update(cipherText).digest().subarray(0, 10);
  const cdnFile = Buffer.concat([cipherText, hmac10]);

  return {
    cdnFile,
    meta: {
      encryption_key: encKey.toString('base64'),
      hmac_key: hmacKey.toString('base64'),
      iv: iv.toString('base64'),
      encrypted_hash: crypto.createHash('sha256').update(cdnFile).digest('base64'),
      plaintext_hash: crypto.createHash('sha256').update(plain).digest('base64'),
    },
  };
}

let passed = 0;
function ok(name) { console.log(`  ✓ ${name}`); passed++; }

// 1. Round-trip: a real-ish PNG header + random body decrypts byte-for-byte.
{
  const plain = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG magic
    crypto.randomBytes(5000),
  ]);
  const { cdnFile, meta } = simulateUpload(plain);
  const out = decryptMediaBytes(cdnFile, meta);
  assert.strictEqual(Buffer.compare(out, plain), 0, 'decrypted bytes must equal original');
  ok('round-trip decrypt recovers exact bytes');
}

// 2. Tampered ciphertext → HMAC validation fails.
{
  const { cdnFile, meta } = simulateUpload(crypto.randomBytes(2048));
  const tampered = Buffer.from(cdnFile);
  tampered[10] ^= 0xff; // flip a bit inside the ciphertext
  // encrypted_hash would also catch it; drop it to prove the HMAC check fires.
  const metaNoEncHash = { ...meta, encrypted_hash: undefined };
  assert.throws(() => decryptMediaBytes(tampered, metaNoEncHash), /HMAC validation failed/);
  ok('tampered ciphertext rejected by HMAC check');
}

// 3. Wrong plaintext_hash → rejected even when crypto succeeds.
{
  const { cdnFile, meta } = simulateUpload(crypto.randomBytes(1024));
  const badMeta = { ...meta, plaintext_hash: crypto.randomBytes(32).toString('base64') };
  assert.throws(() => decryptMediaBytes(cdnFile, badMeta), /plaintext_hash mismatch/);
  ok('plaintext_hash mismatch rejected');
}

// 4. Missing keys → clear error, no crash.
{
  assert.throws(() => decryptMediaBytes(Buffer.alloc(32), {}), /missing encryption_key/);
  ok('missing keys throws a clear error');
}

console.log(`\n${passed}/4 media-decrypt checks passed.`);
