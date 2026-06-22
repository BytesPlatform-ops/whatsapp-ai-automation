// Best-effort per-IP rate limit. Each serverless instance has its own memory,
// so it isn't a hard fleet-wide limit — just a cheap guardrail.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 6;       // per IP per minute

export function rateLimitCheck(ip: string): { ok: boolean; remaining: number; retryAfter?: number } {
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: MAX_REQUESTS - 1 };
  }
  if (bucket.count >= MAX_REQUESTS) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { ok: true, remaining: MAX_REQUESTS - bucket.count };
}

export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}
