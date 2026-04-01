const OpenAI = require('openai');
const { env } = require('../config/env');
const { downloadMedia } = require('../messages/sender');
const { logger } = require('../utils/logger');

let client = null;

function getClient() {
  if (!client) {
    client = new OpenAI({ apiKey: env.llm.openaiApiKey });
  }
  return client;
}

// Map WhatsApp audio MIME types to file extensions Whisper accepts
const EXTENSION_MAP = {
  'audio/ogg; codecs=opus': 'ogg',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'mp4',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'audio/amr': 'amr',
};

/**
 * Download a WhatsApp audio message and transcribe it using OpenAI Whisper.
 * @param {string} mediaId - WhatsApp media ID
 * @param {string} mimeType - MIME type of the audio
 * @returns {Promise<string>} Transcribed text
 */
async function transcribeAudio(mediaId, mimeType) {
  // Download the audio file from WhatsApp
  const { buffer } = await downloadMedia(mediaId);

  const ext = EXTENSION_MAP[mimeType] || 'ogg';
  const fileName = `voice.${ext}`;

  // Create a File object from the buffer for the OpenAI SDK
  const file = new File([buffer], fileName, { type: mimeType });

  const openai = getClient();

  const response = await openai.audio.transcriptions.create({
    model: 'whisper-1',
    file,
  });

  logger.info(`Audio transcribed (${buffer.length} bytes): "${response.text.slice(0, 100)}..."`);

  return response.text;
}

module.exports = { transcribeAudio };
