'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Check, Plus, Trash2, Globe } from 'lucide-react';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';
import type { RcpWidgetConfig } from '@/lib/pixie-lab/serviceTypes';
import { OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { Card, Section, Field, TextInput, TextArea, PrimaryButton, GhostButton, Pill, RCP_ACCENT } from './widgets';

type Status = 'loading' | 'offline' | 'ready';

function embedCode(publicId: string): string {
  // Public widget id only — never the tenant id.
  return `<script async src="https://cdn.pixie.example/widget.js" data-pixie-widget="${publicId}"></script>`;
}

export default function WidgetSetupPanel() {
  const [status, setStatus] = useState<Status>('loading');
  const [cfg, setCfg] = useState<RcpWidgetConfig>({});
  const [domain, setDomain] = useState('');
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await receptionistApi.getWidgetConfig();
    if (!r.backendUp) { setStatus('offline'); return; }
    setCfg((r as { config?: RcpWidgetConfig }).config || {});
    setStatus('ready');
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(patch: Record<string, unknown>) {
    setBusy(true); setErr('');
    const r = await receptionistApi.saveWidgetConfig(patch);
    setBusy(false);
    if (!r.backendUp) { setErr('Could not save widget settings.'); return; }
    setCfg((r as { config?: RcpWidgetConfig }).config || {});
  }

  function addDomain() {
    const d = domain.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    if (!d || !/^[a-z0-9.*-]+\.[a-z]{2,}$/.test(d)) { setErr('Enter a valid domain (e.g. shop.example or *.shop.example).'); return; }
    const next = Array.from(new Set([...(cfg.allowed_domains || []), d]));
    setDomain('');
    void save({ allowed_domains: next });
  }

  function removeDomain(d: string) {
    void save({ allowed_domains: (cfg.allowed_domains || []).filter((x) => x !== d) });
  }

  async function copyEmbed() {
    try {
      await navigator.clipboard.writeText(embedCode(cfg.public_id || ''));
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard may be unavailable */ }
  }

  if (status === 'loading') return <LoadingCards />;
  if (status === 'offline') return <OfflineState service="AI Receptionist" />;

  return (
    <div className="space-y-6" data-testid="widget-panel">
      {err && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <Section title="Website chat widget" sub="Embed the chat widget on your site. The embed uses only a public widget id.">
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-mono text-slate-600" data-testid="public-id">{cfg.public_id}</span>
              <Pill color={cfg.enabled ? '#16a34a' : '#64748b'}>{cfg.enabled ? 'Enabled' : 'Disabled'}</Pill>
            </div>
            <GhostButton onClick={() => save({ enabled: !cfg.enabled })} disabled={busy}>
              {cfg.enabled ? 'Disable' : 'Enable'}
            </GhostButton>
          </div>
          <Field label="Embed code">
            <div className="flex gap-2">
              <code data-testid="embed-code" className="flex-1 overflow-x-auto rounded bg-slate-900 px-3 py-2 text-xs text-slate-100">
                {embedCode(cfg.public_id || '')}
              </code>
              <PrimaryButton onClick={copyEmbed} aria-label="Copy embed code">
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </PrimaryButton>
            </div>
          </Field>
        </Card>
      </Section>

      <Section title="Allowed domains" sub="Production origins must be HTTPS. Use *.example.com for subdomains.">
        <Card>
          <div className="flex gap-2">
            <TextInput value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="shop.example"
              onKeyDown={(e) => { if (e.key === 'Enter') addDomain(); }} data-testid="domain-input" />
            <PrimaryButton onClick={addDomain} disabled={busy}><Plus size={14} /> Add</PrimaryButton>
          </div>
          <div className="mt-3 space-y-1">
            {(cfg.allowed_domains || []).length === 0 ? (
              <p className="text-sm text-slate-500">No domains yet — the widget won't load until you add one.</p>
            ) : (cfg.allowed_domains || []).map((d) => (
              <div key={d} className="flex items-center justify-between rounded border border-slate-200 px-3 py-1.5 text-sm">
                <span className="flex items-center gap-2"><Globe size={14} color={RCP_ACCENT} /> {d}</span>
                <GhostButton onClick={() => removeDomain(d)} aria-label={`Remove ${d}`}><Trash2 size={14} /></GhostButton>
              </div>
            ))}
          </div>
        </Card>
      </Section>

      <Section title="Messages">
        <Card>
          <Field label="Welcome message">
            <TextArea rows={2} value={cfg.welcome_message || ''} onChange={(e) => setCfg({ ...cfg, welcome_message: e.target.value })}
              onBlur={() => save({ welcome_message: cfg.welcome_message })} />
          </Field>
          <Field label="Offline / business-hours message">
            <TextArea rows={2} value={cfg.offline_message || ''} onChange={(e) => setCfg({ ...cfg, offline_message: e.target.value })}
              onBlur={() => save({ offline_message: cfg.offline_message })} />
          </Field>
        </Card>
      </Section>
    </div>
  );
}
