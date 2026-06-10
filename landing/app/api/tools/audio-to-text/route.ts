import { NextResponse } from 'next/server';
import { getOpenAI, rateLimitCheck, getClientIp } from '@/lib/openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface TranscribeResponse {
  text: string;
}

// 25 MB is the OpenAI audio upload ceiling; reject earlier to fail fast.
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'ogg', 'flac'];

export async function POST(req: Request): Promise<NextResponse<TranscribeResponse | { error: string }>> {
  const ip = getClientIp(req);
  const limit = rateLimitCheck(ip);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Retry in ${limit.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter ?? 60) } },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data with an audio file.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No audio file provided.' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'The audio file is empty.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Audio file is too large (max 25 MB).' }, { status: 413 });
  }
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (ext && !ALLOWED.includes(ext)) {
    return NextResponse.json(
      { error: `Unsupported format ".${ext}". Use mp3, m4a, wav, webm, ogg, or flac.` },
      { status: 415 },
    );
  }

  const language = typeof form.get('language') === 'string' ? String(form.get('language')) : undefined;

  try {
    const client = getOpenAI();
    const result = await client.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      ...(language && language !== 'auto' ? { language } : {}),
    });
    const text = (result.text ?? '').trim();
    if (!text) {
      return NextResponse.json({ error: 'No speech detected in the audio.' }, { status: 502 });
    }
    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const safe = message.includes('OPENAI_API_KEY')
      ? 'Transcription service is not configured'
      : 'Transcription service is temporarily unavailable';
    return NextResponse.json({ error: safe }, { status: 500 });
  }
}
