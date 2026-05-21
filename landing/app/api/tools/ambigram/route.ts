import { NextResponse } from 'next/server';
import { getOpenAI, rateLimitCheck, getClientIp } from '@/lib/openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AmbigramRequest {
  word: string;
  secondWord?: string;
}

interface AmbigramAnalysis {
  score: number;
  scoreLabel: 'Excellent' | 'Good' | 'Fair' | 'Difficult';
  reason: string;
  recommendedStyle: 'gothic' | 'script' | 'modern' | 'tribal';
  styleReason: string;
  tips: string[];
  similarWords: string[];
}

interface AmbigramResponse {
  analysis: AmbigramAnalysis;
}

const SYSTEM_PROMPT = `You are an expert in ambigram typography — the art of designing words that read the same (or as another word) when rotated 180 degrees.

When the user gives you a word (or a pair of words for a chain ambigram), you analyze how well it works as an ambigram and return JSON with your analysis.

Background facts you must use:
- Letters that naturally rotate well: o, x, s, z, n, h, i, l (symmetric or rotation-friendly)
- Letters that need creative merging: k, m, q, w, y, b, p, d
- Short words (4-8 letters) are easiest. Words with paired letters at opposite ends (e.g. AnnA, OttO, level) are excellent
- Pairs of letters that can substitute for each other when rotated: b/q, d/p, n/u, m/w, h/y (sometimes)

Style rules:
- "gothic" — heavy decorative blackletter; best for words with strong vertical strokes
- "script" — flowing cursive; best for words with curves and connecting letters
- "modern" — clean sans-serif; best for short symmetric words
- "tribal" — sharp geometric; best for short bold statements

Output ONLY valid JSON in this exact shape:
{
  "score": 0-100 integer,
  "scoreLabel": "Excellent" | "Good" | "Fair" | "Difficult",
  "reason": "one sentence under 25 words explaining the score",
  "recommendedStyle": "gothic" | "script" | "modern" | "tribal",
  "styleReason": "one sentence under 20 words",
  "tips": ["3 short, specific tips (under 12 words each)"],
  "similarWords": ["3 alternative words/names with similar meaning but better ambigram potential"]
}

Score guide: 80-100 Excellent, 60-79 Good, 40-59 Fair, 0-39 Difficult.
No prose, no markdown, no code fences. Just the JSON.`;

export async function POST(req: Request): Promise<NextResponse<AmbigramResponse | { error: string }>> {
  const ip = getClientIp(req);
  const limit = rateLimitCheck(ip);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Retry in ${limit.retryAfter}s.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter ?? 60) } },
    );
  }

  let body: AmbigramRequest;
  try {
    body = (await req.json()) as AmbigramRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const word = String(body.word ?? '').trim().slice(0, 30);
  const secondWord = body.secondWord ? String(body.secondWord).trim().slice(0, 30) : '';

  if (!word) {
    return NextResponse.json({ error: 'Field "word" is required' }, { status: 400 });
  }
  if (!/^[a-zA-Z][a-zA-Z\s]*$/.test(word) || (secondWord && !/^[a-zA-Z][a-zA-Z\s]*$/.test(secondWord))) {
    return NextResponse.json({ error: 'Words must contain only letters and spaces' }, { status: 400 });
  }

  const userPrompt = secondWord
    ? `Analyze this chain ambigram pair (word A reads as word B when rotated 180°): "${word}" / "${secondWord}"`
    : `Analyze this rotational ambigram (reads the same when rotated 180°): "${word}"`;

  try {
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.6,
      max_tokens: 400,
    });

    const text = completion.choices[0]?.message?.content ?? '{}';
    let parsed: Partial<AmbigramAnalysis>;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: 'Model returned invalid JSON' }, { status: 502 });
    }

    // Validate shape
    const validStyles = ['gothic', 'script', 'modern', 'tribal'] as const;
    const validLabels = ['Excellent', 'Good', 'Fair', 'Difficult'] as const;

    if (
      typeof parsed.score !== 'number' ||
      !validLabels.includes(parsed.scoreLabel as never) ||
      typeof parsed.reason !== 'string' ||
      !validStyles.includes(parsed.recommendedStyle as never) ||
      typeof parsed.styleReason !== 'string' ||
      !Array.isArray(parsed.tips) ||
      !Array.isArray(parsed.similarWords)
    ) {
      return NextResponse.json({ error: 'Model returned malformed analysis' }, { status: 502 });
    }

    const analysis: AmbigramAnalysis = {
      score: Math.max(0, Math.min(100, Math.round(parsed.score))),
      scoreLabel: parsed.scoreLabel as AmbigramAnalysis['scoreLabel'],
      reason: parsed.reason.slice(0, 200),
      recommendedStyle: parsed.recommendedStyle as AmbigramAnalysis['recommendedStyle'],
      styleReason: parsed.styleReason.slice(0, 200),
      tips: parsed.tips.filter((t): t is string => typeof t === 'string').slice(0, 5),
      similarWords: parsed.similarWords.filter((w): w is string => typeof w === 'string').slice(0, 5),
    };

    return NextResponse.json({ analysis });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const safe = message.includes('OPENAI_API_KEY') ? 'AI service is not configured' : 'AI service is temporarily unavailable';
    return NextResponse.json({ error: safe }, { status: 500 });
  }
}
