'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link2, Check, Loader2, Plug } from 'lucide-react';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type { SeoConnectionPlatform } from '@/lib/pixie-lab/serviceTypes';
import { OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';

const ACCENT = '#14B8A6';

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

export function SeoConnectionsPanel() {
  const [status, setStatus] = useState<'loading' | 'done' | 'offline'>('loading');
  const [platforms, setPlatforms] = useState<SeoConnectionPlatform[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    seoApi.connections().then((d) => {
      if (!d.backendUp) return setStatus('offline');
      setPlatforms(Array.isArray(d.platforms) ? d.platforms : []);
      setStatus('done');
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function disconnect(p: string) { await seoApi.disconnect(p); load(); }
  function onConnected() { setOpen(null); load(); }

  if (status === 'loading') return <div className="mt-6"><LoadingCards count={3} height="h-20" /></div>;
  if (status === 'offline') return <div className="mt-6"><OfflineState service="SEO" /></div>;

  return (
    <div className="mt-6 space-y-3">
      <p className="text-[13px] text-[var(--pl-text-muted)]">Connect a platform so Pixie can apply fixes directly. Without a connection, fixes are copy-ready for you to paste.</p>
      {platforms.map((p) => (
        <div key={p.platform} className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
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
                <button onClick={() => disconnect(p.platform)} className="rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]">Disconnect</button>
              </div>
            ) : (
              <button onClick={() => setOpen(open === p.platform ? null : p.platform)} className="rounded-lg px-3.5 py-1.5 text-[12.5px] font-bold text-[#02120f]" style={{ background: ACCENT }}>
                {open === p.platform ? 'Cancel' : 'Connect'}
              </button>
            )}
          </div>
          {open === p.platform && !p.connected && (
            p.platform === 'wordpress' ? <WordpressForm onDone={onConnected} /> : <TokenForm platform={p.platform} onDone={onConnected} />
          )}
        </div>
      ))}
    </div>
  );
}
