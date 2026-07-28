'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link2, Check, Loader2, Plug, RefreshCw, AlertTriangle, Clock, Wifi, WifiOff, ExternalLink, Settings } from 'lucide-react';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type { SeoConnectionPlatform, SeoIntegrationStatus } from '@/lib/pixie-lab/serviceTypes';
import { OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';

const ACCENT = '#14B8A6';

// ── Status helpers ──────────────────────────────────────────────────────────

type IntegStatus = SeoIntegrationStatus['status'];

function statusMeta(s: IntegStatus): { label: string; color: string; Icon: React.ElementType } {
  switch (s) {
    case 'connected': return { label: 'Connected', color: '#22c55e', Icon: Check };
    case 'not_connected': return { label: 'Not connected', color: '#64748b', Icon: WifiOff };
    case 'needs_attention': return { label: 'Needs attention', color: '#f59e0b', Icon: AlertTriangle };
    case 'token_expired': return { label: 'Token expired', color: '#ef4444', Icon: AlertTriangle };
    case 'permission_missing': return { label: 'Permission missing', color: '#ef4444', Icon: AlertTriangle };
    case 'sync_running': return { label: 'Syncing…', color: ACCENT, Icon: RefreshCw };
    default: return { label: s, color: '#64748b', Icon: Wifi };
  }
}

// ── Legacy WordPress / token forms (kept for backwards-compat) ─────────────

function WordpressForm({ onDone }: { onDone: () => void }) {
  const [site, setSite] = useState(''); const [user, setUser] = useState(''); const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  async function submit() {
    if (!site || !user || !pass) { setMsg('All fields are required.'); return; }
    setBusy(true); setMsg(null);
    const d = await seoApi.connectWordpress(site, user, pass);
    setBusy(false);
    if (d.status === 'connected') { onDone(); } else { setMsg(d.message || 'Connection failed — check the credentials.'); }
  }
  const input = 'w-full rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[13px] text-[var(--pl-text)] outline-none focus:border-[var(--pl-green)]';
  return (
    <div className="mt-3 space-y-2">
      <input className={input} placeholder="https://yoursite.com" value={site} onChange={(e) => setSite(e.target.value)} />
      <input className={input} placeholder="WordPress username" value={user} onChange={(e) => setUser(e.target.value)} />
      <input className={input} type="password" placeholder="Application password" value={pass} onChange={(e) => setPass(e.target.value)} />
      {msg && <p className="text-[12px] text-amber-500">{msg}</p>}
      <button onClick={submit} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-bold text-[#02120f] disabled:opacity-50" style={{ background: ACCENT }}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />} Connect
      </button>
    </div>
  );
}

function TokenForm({ platform, onDone }: { platform: string; onDone: () => void }) {
  const [token, setToken] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  async function submit() {
    if (!token) { setMsg('A token is required.'); return; }
    setBusy(true); setMsg(null);
    const d = await seoApi.connectToken(platform, token);
    setBusy(false);
    if (d.status === 'connected') onDone(); else setMsg(d.message || 'Connection failed.');
  }
  return (
    <div className="mt-3 space-y-2">
      <input className="w-full rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3 py-2 text-[13px] text-[var(--pl-text)] outline-none focus:border-[var(--pl-green)]" placeholder="API token" value={token} onChange={(e) => setToken(e.target.value)} />
      {msg && <p className="text-[12px] text-amber-500">{msg}</p>}
      <button onClick={submit} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-bold text-[#02120f] disabled:opacity-50" style={{ background: ACCENT }}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />} Connect
      </button>
    </div>
  );
}

// ── Upgraded integration card ──────────────────────────────────────────────

function IntegrationCard({
  integ,
  onAction,
}: {
  integ: SeoIntegrationStatus;
  onAction: (action: 'sync' | 'disconnect' | 'connect' | 'reconnect' | 'configure', platform: string) => void;
}) {
  const { label, color, Icon } = statusMeta(integ.status);
  const isSyncRunning = integ.status === 'sync_running';

  return (
    <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-10 w-10 flex-none place-items-center rounded-xl bg-[var(--pl-surface-soft)]" style={{ color: ACCENT }}>
          <Link2 size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-[14.5px] font-bold text-[var(--pl-text)]">{integ.name}</p>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
              style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
            >
              <Icon size={11} className={isSyncRunning ? 'animate-spin' : ''} /> {label}
            </span>
          </div>
          {integ.description && <p className="mt-0.5 text-[12.5px] text-[var(--pl-text-muted)]">{integ.description}</p>}
          <div className="mt-1 flex flex-wrap gap-3 text-[12px] text-[var(--pl-text-muted)]">
            {integ.connected_as && <span>As: {integ.connected_as}</span>}
            {integ.last_synced_at && (
              <span className="inline-flex items-center gap-1">
                <Clock size={11} /> {new Date(integ.last_synced_at).toLocaleString()}
              </span>
            )}
            {integ.notes && <span className="text-amber-500">{integ.notes}</span>}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--pl-border)] pt-3">
        {integ.can_connect && (
          <button
            onClick={() => onAction('connect', integ.platform)}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-bold text-[#02120f]"
            style={{ background: ACCENT }}
          >
            <Plug size={12} /> Connect
          </button>
        )}
        {integ.can_reconnect && (
          <button
            onClick={() => onAction('reconnect', integ.platform)}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--pl-text-soft)] hover:text-[var(--pl-text)]"
          >
            <RefreshCw size={12} /> Reconnect
          </button>
        )}
        {integ.status === 'connected' && (
          <button
            onClick={() => onAction('sync', integ.platform)}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--pl-text-soft)] hover:text-[var(--pl-text)]"
          >
            <RefreshCw size={12} className={isSyncRunning ? 'animate-spin' : ''} /> Sync now
          </button>
        )}
        {integ.can_configure && (
          <button
            onClick={() => onAction('configure', integ.platform)}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--pl-text-soft)] hover:text-[var(--pl-text)]"
          >
            <Settings size={12} /> Configure
          </button>
        )}
        {integ.can_disconnect && (
          <button
            onClick={() => onAction('disconnect', integ.platform)}
            className="ml-auto rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--pl-text-soft)] hover:text-red-400"
          >
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}

// ── Legacy platform card (fallback when new integrations endpoint is unavailable) ──

function LegacyPlatformCard({
  p,
  open,
  onToggle,
  onConnected,
  onDisconnect,
}: {
  p: SeoConnectionPlatform;
  open: boolean;
  onToggle: () => void;
  onConnected: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--pl-surface-soft)]" style={{ color: ACCENT }}><Link2 size={18} /></span>
          <div>
            <p className="font-display text-[14.5px] font-bold text-[var(--pl-text)]">{p.name}</p>
            <p className="text-[12px] text-[var(--pl-text-muted)]">{p.connected ? `Connected${p.connected_as ? ` as ${p.connected_as}` : ''}` : (p.can_optimize ? 'Enables one-tap fixes' : 'Copy-ready fixes only')}</p>
          </div>
        </div>
        {p.connected ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={{ background: 'color-mix(in srgb, #22c55e 16%, transparent)', color: '#22c55e' }}><Check size={12} /> Connected</span>
            <button onClick={onDisconnect} className="rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]">Disconnect</button>
          </div>
        ) : (
          <button onClick={onToggle} className="rounded-lg px-3.5 py-1.5 text-[12.5px] font-bold text-[#02120f]" style={{ background: ACCENT }}>
            {open ? 'Cancel' : 'Connect'}
          </button>
        )}
      </div>
      {open && !p.connected && (
        p.platform === 'wordpress' ? <WordpressForm onDone={onConnected} /> : <TokenForm platform={p.platform} onDone={onConnected} />
      )}
    </div>
  );
}

// ── Google OAuth button ────────────────────────────────────────────────────

function GoogleConnectButton({ onConnected }: { onConnected: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function connect() {
    setBusy(true); setMsg(null);
    const d = await seoApi.googleConnect();
    setBusy(false);
    if (d.backendUp && d.auth_url) {
      window.location.href = d.auth_url;
    } else {
      setMsg('Could not start Google OAuth — the SEO service may be offline.');
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={connect}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-2.5 text-[13px] font-semibold text-[var(--pl-text)] shadow-sm hover:bg-[var(--pl-surface-hover)] disabled:opacity-50 transition"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : (
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
        )}
        Connect Google (Search Console / GA4)
        <ExternalLink size={12} className="text-[var(--pl-text-muted)]" />
      </button>
      {msg && <p className="text-[12px] text-amber-500">{msg}</p>}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function SeoConnectionsPanel() {
  const [status, setStatus] = useState<'loading' | 'done' | 'offline'>('loading');
  const [integrations, setIntegrations] = useState<SeoIntegrationStatus[]>([]);
  // Fallback legacy platforms if new endpoint unavailable.
  const [platforms, setPlatforms] = useState<SeoConnectionPlatform[]>([]);
  const [useLegacy, setUseLegacy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    // Try new integrations endpoint first.
    const integEnv = await seoApi.integrations();
    if (integEnv.backendUp && integEnv.integrations && integEnv.integrations.length > 0) {
      setIntegrations(integEnv.integrations);
      setUseLegacy(false);
      setLastUpdated(new Date());
      setStatus('done');
      return;
    }
    // Fall back to legacy connections endpoint.
    const legacyEnv = await seoApi.connections();
    if (!legacyEnv.backendUp) { setStatus('offline'); return; }
    setPlatforms(Array.isArray(legacyEnv.platforms) ? legacyEnv.platforms : []);
    setUseLegacy(true);
    setLastUpdated(new Date());
    setStatus('done');
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleIntegAction(action: 'sync' | 'disconnect' | 'connect' | 'reconnect' | 'configure', platform: string) {
    // For Google actions, delegate to googleConnect.
    if (platform === 'search_console' || platform === 'analytics' || platform === 'google') {
      if (action === 'connect' || action === 'reconnect') {
        const d = await seoApi.googleConnect();
        if (d.auth_url) { window.location.href = d.auth_url; return; }
      }
    }
    // Generic: for legacy platforms, use connectToken / disconnect.
    if (action === 'disconnect') {
      await seoApi.disconnect(platform);
      load();
    } else {
      // TODO: handle configure via a future settings modal.
      load();
    }
  }

  if (status === 'loading') return <div className="mt-6"><LoadingCards count={4} height="h-24" /></div>;
  if (status === 'offline') return <div className="mt-6"><OfflineState service="SEO" action={<button onClick={load} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} /></div>;

  return (
    <div className="mt-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-[var(--pl-text-muted)]">
          Connect your platforms so Pixie can apply fixes directly and pull analytics data.
          Without a connection, fixes are copy-ready only.
        </p>
        {lastUpdated && (
          <span className="flex-none text-[11.5px] text-[var(--pl-text-muted)]">Updated {lastUpdated.toLocaleTimeString()}</span>
        )}
      </div>

      {/* Google OAuth entry point */}
      <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
        <p className="mb-3 font-display text-[13.5px] font-bold text-[var(--pl-text)]">Google integrations</p>
        <p className="mb-3 text-[12.5px] text-[var(--pl-text-muted)]">Connect Google to import Search Console data, GA4 metrics, and Core Web Vitals into your SEO workspace.</p>
        <GoogleConnectButton onConnected={load} />
      </div>

      {/* New integrations-centre view */}
      {!useLegacy && integrations.length > 0 && (
        <div className="space-y-3">
          {integrations.map((integ) => (
            <IntegrationCard key={integ.platform} integ={integ} onAction={handleIntegAction} />
          ))}
        </div>
      )}

      {/* Legacy platform list (backwards compat / offline fallback) */}
      {useLegacy && platforms.length > 0 && (
        <div className="space-y-3">
          {platforms.map((p) => (
            <LegacyPlatformCard
              key={p.platform}
              p={p}
              open={open === p.platform}
              onToggle={() => setOpen(open === p.platform ? null : p.platform)}
              onConnected={() => { setOpen(null); load(); }}
              onDisconnect={async () => { await seoApi.disconnect(p.platform); load(); }}
            />
          ))}
        </div>
      )}

      {!useLegacy && integrations.length === 0 && (
        <p className="text-center text-[13px] text-[var(--pl-text-muted)]">No integrations configured yet — connect Google above to get started.</p>
      )}
    </div>
  );
}
