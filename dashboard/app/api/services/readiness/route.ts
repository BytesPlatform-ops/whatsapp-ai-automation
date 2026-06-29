import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Live service readiness — proxies the Python backend's channels/agents API and
 * returns a compact per-service readiness summary the dashboard badges with.
 *
 * Honest by design: if the backend is unreachable, every mappable service comes
 * back `state: "unavailable"` and `backendUp: false` — the dashboard then falls
 * back to the static requirements checklist rather than faking "ready".
 *
 * (Mirrors landing/app/api/services/readiness/route.ts; the standalone dashboard
 * carries its own copy so it can be deployed independently of the marketing app.)
 */

const BACKEND_URL = process.env.PIXIE_BACKEND_URL || 'http://localhost:8000';

const SLUG_TO_AGENT: Record<string, string> = {
  'ai-receptionist': 'receptionist',
  'social-media-marketing': 'marketing',
  'seo-audit': 'seo',
  'omnichannel-ai': 'omnichannel',
};

interface ChannelStatus {
  channel: string;
  enabled: boolean;
  requirements_met: boolean;
  live: boolean;
  missing?: string[];
}

type ServiceState = 'live' | 'partial' | 'setup' | 'unavailable';

interface ServiceReadiness {
  slug: string;
  agent: string;
  channelsTotal: number;
  channelsReady: number;
  channelsLive: number;
  missing: string[];
  state: ServiceState;
}

async function fetchAgent(agent: string, tenant: string, signal: AbortSignal): Promise<ServiceReadiness | null> {
  const url = `${BACKEND_URL}/api/channels/agents/${encodeURIComponent(agent)}?tenant_id=${encodeURIComponent(tenant)}`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
  if (!res.ok) return null;
  const data = (await res.json()) as { channel_statuses?: ChannelStatus[] };
  const statuses = Array.isArray(data.channel_statuses) ? data.channel_statuses : [];

  const channelsReady = statuses.filter((s) => s.requirements_met).length;
  const channelsLive = statuses.filter((s) => s.live).length;
  const missing = Array.from(new Set(statuses.flatMap((s) => s.missing || [])));

  let state: ServiceState;
  if (channelsLive > 0) state = 'live';
  else if (channelsReady > 0) state = 'partial';
  else state = 'setup';

  return { slug: '', agent, channelsTotal: statuses.length, channelsReady, channelsLive, missing, state };
}

export async function GET(req: Request) {
  const tenant = new URL(req.url).searchParams.get('tenant_id') || 'demo';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  const entries = Object.entries(SLUG_TO_AGENT);
  const results = await Promise.all(
    entries.map(async ([slug, agent]) => {
      try {
        const r = await fetchAgent(agent, tenant, controller.signal);
        if (!r) {
          return [slug, { slug, agent, channelsTotal: 0, channelsReady: 0, channelsLive: 0, missing: [], state: 'unavailable' as ServiceState }];
        }
        return [slug, { ...r, slug }];
      } catch {
        return [slug, { slug, agent, channelsTotal: 0, channelsReady: 0, channelsLive: 0, missing: [], state: 'unavailable' as ServiceState }];
      }
    }),
  );
  clearTimeout(timeout);

  const services = Object.fromEntries(results) as Record<string, ServiceReadiness>;
  const backendUp = Object.values(services).some((s) => s.state !== 'unavailable');

  return NextResponse.json({ tenant, backendUp, services }, { headers: { 'Cache-Control': 'no-store' } });
}
