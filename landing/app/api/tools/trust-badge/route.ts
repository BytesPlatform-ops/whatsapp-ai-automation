import { NextResponse } from 'next/server';
import { getOpenAI, rateLimitCheck, getClientIp } from '@/lib/openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SuggestRequest {
  promise: string;
  context?: string;
}

interface SuggestResponse {
  variants: string[];
}

const SYSTEM_PROMPT = `You are a conversion copywriter who writes short, punchy trust-badge text for ecommerce stores.

When the user describes a guarantee or promise, you return EXACTLY 4 short variants in JSON.

Rules:
- Each variant must be 2-6 words MAX. No long sentences.
- Each variant must read as if it could go inside a small circular or shield-shaped badge.
- Use confident, specific language. Avoid weasel words like "may", "could", "potentially".
- Mix styles: one bold/short, one with a number/timeframe, one trust-building, one benefit-led.
- Output ONLY valid JSON in this exact shape: {"variants": ["...", "...", "...", "..."]}.
- No prose, no markdown, no code fences. Just the JSON object.`;

export async function POST(req: Request): Promise<NextResponse<SuggestResponse | { error: string }>> {
  // Rate limit
  const ip = getClientIp(req);
  const limit = rateLimitCheck(ip);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Retry in ${limit.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter ?? 60) } },
    );
  }

  // Parse + validate body
  let body: SuggestRequest;
  try {
    body = (await req.json()) as SuggestRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const promise = String(body.promise ?? '').trim().slice(0, 200);
  if (!promise) {
    return NextResponse.json({ error: 'Field "promise" is required' }, { status: 400 });
  }

  const userPrompt =
    `Promise to convert into badge text variants: "${promise}"` +
    (body.context ? `\n\nStore/product context: "${String(body.context).slice(0, 200)}"` : '');

  // Call OpenAI
  try {
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 250,
    });

    const text = completion.choices[0]?.message?.content ?? '{}';
    let parsed: { variants?: unknown };
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: 'Model returned invalid JSON' }, { status: 502 });
    }

    const variants = Array.isArray(parsed.variants)
      ? parsed.variants.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).slice(0, 4)
      : [];

    if (variants.length === 0) {
      return NextResponse.json({ error: 'No variants returned' }, { status: 502 });
    }

    return NextResponse.json({ variants });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    // Don't leak the OPENAI_API_KEY error to clients; show a generic message.
    const safe = message.includes('OPENAI_API_KEY') ? 'AI service is not configured' : 'AI service is temporarily unavailable';
    return NextResponse.json({ error: safe }, { status: 500 });
  }
}
