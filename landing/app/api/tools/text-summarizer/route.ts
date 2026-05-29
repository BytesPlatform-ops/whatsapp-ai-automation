import { NextResponse } from 'next/server';
import { getOpenAI, rateLimitCheck, getClientIp } from '@/lib/openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Length = 'short' | 'medium' | 'long';

interface SummarizeRequest {
  text: string;
  length?: Length;
}

interface SummarizeResponse {
  summary: string;
  keyPoints: string[];
}

const LENGTH_GUIDE: Record<Length, string> = {
  short: 'one or two sentences',
  medium: 'a short paragraph (3-4 sentences)',
  long: 'a thorough paragraph (5-7 sentences)',
};

const MAX_INPUT = 6000;

const SYSTEM_PROMPT = `You are a precise summarization assistant.

Given a block of text, you return a faithful summary and the key points, in JSON.

Rules:
- Summarize ONLY what the text says. Do not invent facts or add outside information.
- Keep the summary in the same language as the input.
- "keyPoints" must be 3-6 short bullet strings, each a single idea, no leading bullet characters.
- Output ONLY valid JSON in this exact shape: {"summary": "...", "keyPoints": ["...", "..."]}.
- No prose, no markdown, no code fences. Just the JSON object.`;

export async function POST(req: Request): Promise<NextResponse<SummarizeResponse | { error: string }>> {
  const ip = getClientIp(req);
  const limit = rateLimitCheck(ip);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Retry in ${limit.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter ?? 60) } },
    );
  }

  let body: SummarizeRequest;
  try {
    body = (await req.json()) as SummarizeRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const text = String(body.text ?? '').trim().slice(0, MAX_INPUT);
  if (text.length < 40) {
    return NextResponse.json({ error: 'Please paste at least a few sentences to summarize.' }, { status: 400 });
  }
  const length: Length = body.length === 'short' || body.length === 'long' ? body.length : 'medium';

  const userPrompt = `Summarize the following text. The "summary" should be ${LENGTH_GUIDE[length]}.\n\nTEXT:\n"""\n${text}\n"""`;

  try {
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 600,
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    let parsed: { summary?: unknown; keyPoints?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Model returned invalid JSON' }, { status: 502 });
    }

    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    const keyPoints = Array.isArray(parsed.keyPoints)
      ? parsed.keyPoints.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).slice(0, 6)
      : [];

    if (!summary) {
      return NextResponse.json({ error: 'No summary returned' }, { status: 502 });
    }

    return NextResponse.json({ summary, keyPoints });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const safe = message.includes('OPENAI_API_KEY') ? 'AI service is not configured' : 'AI service is temporarily unavailable';
    return NextResponse.json({ error: safe }, { status: 500 });
  }
}
