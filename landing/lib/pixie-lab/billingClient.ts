'use client';

/**
 * Typed browser client for the Pixie Lab Billing Center. Talks ONLY to the
 * same-origin authenticated proxy `/api/lab/billing/*` — never the Python
 * backend directly, never a tenant id, never a token. Discriminated results so
 * callers handle unauthorized / forbidden / offline / billing-error states
 * distinctly.
 *
 * Credit amounts from the backend are integer milli-credits (mc).
 * 1 credit = 1000 mc. Use `mcToCredits` / `formatCredits` for display.
 */

// ── credit helpers ────────────────────────────────────────────────────────────

/** Convert integer milli-credits to a decimal credit string (up to 3 dp,
 *  trailing zeros trimmed). e.g. 1000 → "1", 1500 → "1.5", 1 → "0.001". */
export function mcToCredits(mc: number): string {
  const raw = (mc / 1000).toFixed(3);
  // strip trailing zeros after decimal point
  return raw.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

/** Like mcToCredits but also formats with commas for large numbers.
 *  e.g. 1500000 → "1,500" */
export function formatCredits(mc: number): string {
  const credits = mc / 1000;
  const dp = credits % 1 === 0 ? 0 : credits * 10 % 1 === 0 ? 1 : credits * 100 % 1 === 0 ? 2 : 3;
  return credits.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

// ── error types ───────────────────────────────────────────────────────────────

export type BillingErrorCode =
  | 'insufficient_credits'
  | 'feature_not_entitled'
  | 'usage_limit_reached'
  | 'plan_inactive'
  | 'billing_past_due'
  | 'payment_required';

export type BillErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'billing_error'
  | 'offline'
  | 'server'
  | 'unknown';

export interface BillError {
  kind: BillErrorKind;
  status: number;
  message: string;
  /** Structured error code from the backend (e.g. 'insufficient_credits') */
  code?: BillingErrorCode;
  detail?: unknown;
}

export type BillResult<T> = { ok: true; data: T } | { ok: false; error: BillError };

// ── response shapes ───────────────────────────────────────────────────────────

export interface BillingConfig {
  credit_system_enabled: boolean;
  billing_enforcement_enabled: boolean;
  byok_credit_policy: string;
  mock_usage_consumes_credits: boolean;
  reservation_ttl_seconds: number;
  reconciliation_enabled: boolean;
}

export interface BillingSubscription {
  status: string;
  plan_id: string;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  past_due: boolean;
}

export interface BillingPlanInfo {
  id: string;
  name: string;
  monthly_credits: number;
}

export interface BillingStatus {
  subscription: BillingSubscription;
  plan: BillingPlanInfo;
}

export interface WalletData {
  available_mc: number;
  reserved_mc: number;
  lifetime_granted_mc: number;
  lifetime_purchased_mc: number;
  lifetime_consumed_mc: number;
  lifetime_refunded_mc: number;
  plan_id: string;
  period_start: string | null;
  period_end: string | null;
}

export interface PlanDetails {
  id: string;
  name: string;
  monthly_credits: number;
  access: Record<string, boolean>;
  limits: Record<string, number>;
}

export interface WalletResponse {
  wallet: WalletData;
  plan: PlanDetails;
}

export interface EntitlementsResponse {
  plan: { id: string; name: string };
  access: Record<string, boolean>;
  limits: Record<string, number>;
}

export interface UsagePeriod {
  start: string;
  end: string;
  fallback: boolean;
}

export interface UsageCounter {
  key: string;
  used: number;
  limit: number;
  remaining: number;
}

export interface UsageResponse {
  period: UsagePeriod;
  counters: UsageCounter[];
}

export interface LedgerEntry {
  id: string;
  entry_type: string;
  amount_mc: number;
  reserved_delta_mc: number;
  reason_code: string;
  reference_type: string;
  reference_id: string;
  created_at: string;
  reservation_id: string | null;
  original_txn_id: string | null;
}

export interface LedgerResponse {
  total: number;
  limit: number;
  offset: number;
  entries: LedgerEntry[];
}

export interface EstimateRequest {
  operation: string;
  variations?: number;
  duration_seconds?: number;
  model?: string;
  outputs?: number;
  is_mock: boolean;
  byok: boolean;
}

export interface EstimateResponse {
  operation_type: string;
  estimated_credits_mc: number;
  max_reservation_mc: number;
  mock: boolean;
  byok: boolean;
  byok_policy: string;
  enforcement_enabled: boolean;
  credit_system_enabled: boolean;
  available_mc: number;
  sufficient: boolean;
}

// ── classify ──────────────────────────────────────────────────────────────────

const BILLING_ERROR_CODES = new Set<string>([
  'insufficient_credits',
  'feature_not_entitled',
  'usage_limit_reached',
  'plan_inactive',
  'billing_past_due',
  'payment_required',
]);

export function classify(status: number, code?: string): BillErrorKind {
  if (code && BILLING_ERROR_CODES.has(code)) return 'billing_error';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status >= 500) return 'server';
  return 'unknown';
}

// ── internal fetch ────────────────────────────────────────────────────────────

interface CallOpts {
  body?: Record<string, unknown>;
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

function messageFrom(
  json: Record<string, unknown> | null,
  status: number,
): { message: string; code?: string; detail?: unknown } {
  const detail = json?.detail;
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const d = detail as Record<string, unknown>;
    const code = typeof d.error === 'string' ? d.error : undefined;
    if (typeof d.message === 'string') return { message: d.message, code, detail };
  }
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as { loc?: unknown[]; msg?: string };
    const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : '';
    return { message: `${field ? `${field}: ` : ''}${first.msg || 'Invalid input.'}`, detail };
  }
  if (typeof detail === 'string') return { message: detail, detail };
  if (typeof json?.error === 'string') return { message: json.error as string };
  return { message: `Request failed (${status}).` };
}

const BASE = '/api/lab/billing';

async function call<T>(
  method: string,
  path: string,
  opts: CallOpts = {},
): Promise<BillResult<T>> {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const url = new URL(`${BASE}${path}`, origin);
  for (const [k, v] of Object.entries(opts.params || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  let res: Response;
  try {
    res = await fetch(url.toString().replace(url.origin, ''), {
      method,
      cache: 'no-store',
      signal: opts.signal,
      headers:
        method === 'GET'
          ? { Accept: 'application/json' }
          : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(opts.body || {}),
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    return {
      ok: false,
      error: {
        kind: 'offline',
        status: 0,
        message: 'Network error — the billing service is unreachable.',
      },
    };
  }

  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;

  if (json && json.backendUp === false) {
    return {
      ok: false,
      error: {
        kind: 'offline',
        status: 503,
        message: String(json.error || 'The billing service is offline.'),
      },
    };
  }

  if (res.ok) return { ok: true, data: json as unknown as T };

  const { message, code, detail } = messageFrom(json, res.status);
  const kind = classify(res.status, code);
  return {
    ok: false,
    error: {
      kind,
      status: res.status,
      message,
      code: kind === 'billing_error' ? (code as BillingErrorCode) : undefined,
      detail,
    },
  };
}

// ── exports ───────────────────────────────────────────────────────────────────

export const getBillingConfig = (signal?: AbortSignal) =>
  call<BillingConfig>('GET', '/config', { signal });

export const getBillingStatus = (signal?: AbortSignal) =>
  call<BillingStatus>('GET', '/status', { signal });

export const getWallet = (signal?: AbortSignal) =>
  call<WalletResponse>('GET', '/wallet', { signal });

export const getEntitlements = (signal?: AbortSignal) =>
  call<EntitlementsResponse>('GET', '/entitlements', { signal });

export const getUsage = (signal?: AbortSignal) =>
  call<UsageResponse>('GET', '/usage', { signal });

export const getLedger = (
  q: { limit?: number; offset?: number; type?: string } = {},
  signal?: AbortSignal,
) =>
  call<LedgerResponse>('GET', '/ledger', {
    params: { limit: q.limit, offset: q.offset, type: q.type },
    signal,
  });

export const postCheckout = (plan: string) =>
  call<{ url: string }>('POST', '/checkout', { body: { plan } });

export const postPortal = () => call<{ url: string }>('POST', '/portal', { body: {} });

export const postEstimate = (req: EstimateRequest) =>
  call<EstimateResponse>('POST', '/estimate', { body: req as unknown as Record<string, unknown> });
