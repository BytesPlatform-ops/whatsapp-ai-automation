'use client';

import { PERM_COLOR } from './metaClient';

/** Every Meta page shows exactly what's real vs mock/demo — no hidden state. */
export function MetaHonestyBar({ status, storage, permissions }: { status: any; storage: any; permissions: any }) {
  const chip = (label: string, val: string, color?: string) => (
    <span style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: color || 'rgba(255,255,255,0.85)' }}>
      {label}: <b>{val}</b>
    </span>
  );
  const persistence = storage?.persistence;
  const connected = status?.connected;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 10 }}>
      {chip('Persistence', persistence?.backend || '—', persistence?.multi_instance ? '#6ee7b7' : '#fcd34d')}
      {chip('Execution', status?.execution_mode || '—', status?.execution_mode === 'real' ? '#fda4af' : '#93c5fd')}
      {chip('Meta', connected ? (status?.mode === 'live' ? 'connected' : 'demo') : 'not connected', connected ? (status?.mode === 'live' ? '#6ee7b7' : '#fcd34d') : '#fda4af')}
      {chip('Storage', storage?.provider || '—', storage?.meta_reachable ? '#6ee7b7' : '#fcd34d')}
      {permissions ? chip('Comments perm', permissions.comments || '—', PERM_COLOR[permissions.comments]) : null}
      {permissions ? chip('DM perm', permissions.dms || '—', PERM_COLOR[permissions.dms]) : null}
      {connected && status?.mode === 'demo' ? (
        <span style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 999, background: 'rgba(252,211,77,0.12)', color: '#fcd34d', fontWeight: 600 }}>
          Demo data — nothing is connected to real Meta
        </span>
      ) : null}
    </div>
  );
}
