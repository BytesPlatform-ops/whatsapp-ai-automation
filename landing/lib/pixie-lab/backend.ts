import 'server-only';
import { NextResponse } from 'next/server';
import { getCurrentMembership, can, type Membership } from '@/lib/workspace';
import type { Permission } from '@/lib/permissions';

/**
 * Server-side bridge to the Python FastAPI backend (SEO / Meta / Content services).
 *
 * The backend has NO auth of its own and trusts `tenant_id` blindly (it even
 * defaults to a shared "demo_tenant"). So the ONE rule every proxy must follow:
 * the tenant is resolved HERE, server-side, from the signed-in session — a
 * client-supplied tenant_id is never forwarded. That makes cross-workspace data
 * access impossible from the browser. Reads require `<service>.view`, mutations
 * require `<service>.manage` (mirrors app/api/lab/entitlements/route.ts).
 */

export const BACKEND = process.env.PIXIE_BACKEND_URL || 'http://localhost:8000';

function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * The backend tenant for the caller's workspace. Workspace-scoped (not per-user)
 * so teammates of the same workspace share one inbox / audit history / approval
 * queue. In local demo mode (no Supabase) we fall back to a single "demo" tenant
 * so the Lab is still browsable.
 */
export function tenantForMembership(membership: Membership | null): string {
  return membership ? `ws_${membership.workspaceId}` : 'demo';
}

export interface ResolvedCaller {
  tenant: string;
  membership: Membership | null;
  /** true when running without Supabase configured (local preview) */
  demo: boolean;
}

/** Resolve the caller + their workspace tenant, server-side. Null when a real
 *  (Supabase-configured) deployment has no valid session. */
export async function resolveCaller(): Promise<ResolvedCaller | null> {
  if (!supabaseConfigured()) return { tenant: 'demo', membership: null, demo: true };
  try {
    const ctx = await getCurrentMembership();
    if (!ctx) return null;
    return { tenant: tenantForMembership(ctx.membership), membership: ctx.membership, demo: false };
  } catch (e: any) {
    // A DB / session hiccup should degrade to "not signed in" (401), never 500
    // the whole tool page.
    console.error('[pixie-lab/backend] resolveCaller failed:', e?.message);
    return null;
  }
}

export type Guarded =
  | { ok: true; tenant: string; membership: Membership | null; demo: boolean }
  | { ok: false; response: NextResponse };

/**
 * Guard a proxy handler: resolves the caller and checks a permission. On failure
 * returns a ready-to-return NextResponse (401 not signed in / 403 forbidden). In
 * demo mode the permission check is skipped so local preview works.
 */
export async function guard(perm: Permission): Promise<Guarded> {
  const caller = await resolveCaller();
  if (!caller) {
    return { ok: false, response: NextResponse.json({ backendUp: true, error: 'Not signed in' }, { status: 401 }) };
  }
  if (!caller.demo && caller.membership && !can(caller.membership, perm)) {
    return { ok: false, response: NextResponse.json({ backendUp: true, error: 'You do not have permission for this action.' }, { status: 403 }) };
  }
  return { ok: true, tenant: caller.tenant, membership: caller.membership, demo: caller.demo };
}

function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

/** Build a backend URL, always injecting the server-resolved tenant_id and
 *  dropping any client-provided one. */
export function backendUrl(path: string, tenant: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(path.startsWith('/') ? path : `/${path}`, BACKEND);
  url.searchParams.set('tenant_id', tenant);
  for (const [k, v] of Object.entries(params || {})) {
    if (k === 'tenant_id') continue; // never let a caller override the tenant
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  return url.toString();
}

export interface BackendResult<T = unknown> {
  backendUp: boolean;
  status: number;
  data: T | null;
}

/** GET a backend JSON endpoint with a timeout + graceful degrade. */
export async function backendGet<T = unknown>(path: string, tenant: string, params?: Record<string, string | number | boolean | undefined>, ms = 6000): Promise<BackendResult<T>> {
  const { signal, done } = withTimeout(ms);
  try {
    const res = await fetch(backendUrl(path, tenant, params), { signal, cache: 'no-store', headers: { Accept: 'application/json' } });
    const data = res.ok ? ((await res.json().catch(() => null)) as T) : null;
    return { backendUp: res.ok, status: res.status, data };
  } catch {
    return { backendUp: false, status: 0, data: null };
  } finally {
    done();
  }
}

/** Send a JSON body to a backend endpoint (POST/DELETE), injecting the resolved
 *  tenant_id into the body so the client can never spoof it. */
export async function backendSend<T = unknown>(method: 'POST' | 'DELETE' | 'PUT', path: string, tenant: string, body: Record<string, unknown> = {}, params?: Record<string, string | number | boolean | undefined>, ms = 20000): Promise<BackendResult<T>> {
  const { signal, done } = withTimeout(ms);
  try {
    const res = await fetch(backendUrl(path, tenant, params), {
      method,
      signal,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...body, tenant_id: tenant, now: new Date().toISOString() }),
    });
    const data = (await res.json().catch(() => null)) as T;
    return { backendUp: true, status: res.status, data };
  } catch {
    return { backendUp: false, status: 0, data: null };
  } finally {
    done();
  }
}

/** Standard degraded JSON payload when the backend can't be reached. */
export function degraded(extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ backendUp: false, ...extra }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

/** Standard success JSON payload wrapping a backend result. */
export function ok(data: unknown, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ backendUp: true, ...extra, ...(data && typeof data === 'object' ? data : { data }) }, { headers: { 'Cache-Control': 'no-store' } });
}
