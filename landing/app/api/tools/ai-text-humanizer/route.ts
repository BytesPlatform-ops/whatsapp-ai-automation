import { NextResponse } from 'next/server';
import { getOpenAI, rateLimitCheck, getClientIp } from '@/lib/openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface HumanizeRequest {
  text: string;
  tone?: string;
}

interface HumanizeResponse {
  humanized: string;
}

const MAX_INPUT = 4000;

const SYSTEM_PROMPT = `You are an editor who rewrites stiff, robotic, or AI-sounding text so it reads like a real, fluent human wrote it.

Rules:
- Preserve the original meaning, facts, and language. Do not add new claims.
- Vary sentence length and rhythm. Prefer plain, natural wording over jargon and filler.
- Remove tell-tale AI phrasing ("in today's fast-paced world", "it is important to note", "delve", "moreover", excessive hedging).
- Keep it roughly the same length as the input. Do not summarize.
- Output ONLY valid JSON in this exact shape: {"humanized": "..."}.
- No prose, no markdown, no code fences. Just the JSON object.`;

export async function POST(req: Request): Promise<NextResponse<HumanizeResponse | { error: string }>> {
  const ip = getClientIp(req);
  const limit = rateLimitCheck(ip);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Retry in ${limit.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter ?? 60) } },
    );
  }

  let body: HumanizeRequest;
  try {
    body = (await req.json()) as HumanizeRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const text = String(body.text ?? '').trim().slice(0, MAX_INPUT);
  if (text.length < 40) {
    return NextResponse.json({ error: 'Please paste at least a few sentences to humanize.' }, { status: 400 });
  }
  const tone = String(body.tone ?? '').trim().slice(0, 40);

  const userPrompt =
    `Rewrite the following text to sound naturally human${tone ? ` in a ${tone} tone` : ''}:\n\n"""\n${text}\n"""`;

  try {
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8,
      max_tokens: 1500,
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    let parsed: { humanized?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Model returned invalid JSON' }, { status: 502 });
    }

    const humanized = typeof parsed.humanized === 'string' ? parsed.humanized.trim() : '';
    if (!humanized) {
      return NextResponse.json({ error: 'No rewrite returned' }, { status: 502 });
    }

    return NextResponse.json({ humanized });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const safe = message.includes('OPENAI_API_KEY') ? 'AI service is not configured' : 'AI service is temporarily unavailable';
    return NextResponse.json({ error: safe }, { status: 500 });
  }
}
