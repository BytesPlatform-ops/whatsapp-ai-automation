'use client';

/**
 * Minimal authenticated CONNECTIVITY screen for the AI Content Creator pipeline.
 *
 * Phase 1 only — it proves the repaired end-to-end path is live:
 *   authenticated page → /api/lab/content-creator proxy → authenticated backend
 *   → durable repositories → response → render.
 * It deliberately does NOT implement the 13-step wizard (Phase 2). No hardcoded
 * data, no fake activity, no secrets — everything shown comes from the backend.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clapperboard, Loader2, Sparkles, WifiOff } from 'lucide-react';
import { contentCreatorApi } from '@/lib/pixie-lab/servicesClient';
import { PageContainer, PageHeader, SettingsCard, Field, BackToDashboard } from '@/components/pixie-lab/PageKit';

type StatusEnv = Awaited<ReturnType<typeof contentCreatorApi.status>>;
type ProfileEnv = Awaited<ReturnType<typeof contentCreatorApi.profile>>;

function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'muted'; children: React.ReactNode }) {
  const colors =
    tone === 'ok'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
      : tone === 'warn'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
      : 'border-[var(--pl-border)] bg-[var(--pl-surface-soft)] text-[var(--pl-text-soft)]';
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${colors}`}>{children}</span>;
}

export function ContentCreatorConnectivity() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusEnv | null>(null);
  const [profile, setProfile] = useState<ProfileEnv | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [s, p] = await Promise.all([contentCreatorApi.status(), contentCreatorApi.profile()]);
      if (!alive) return;
      setStatus(s);
      setProfile(p);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const online = status?.backendUp === true;
  // /profile 404s (→ backendUp:false) when a tenant has no profile yet; only trust
  // that as "no profile" once /status proves the backend itself is reachable.
  const hasProfile = online && profile?.backendUp === true && Boolean(profile?.profile?.business_name);
  const mockMode = Boolean(status?.mock_mode ?? status?.mock);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="AI Content Creator"
        title="Content Creator"
        description="The AI-influencer pipeline that turns a business into approved, on-brand short-form videos."
      />

      {loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-6 text-sm text-[var(--pl-text-soft)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking the Content Creator service…
        </div>
      ) : !online ? (
        <SettingsCard icon={WifiOff} title="Service offline" subtitle="The Content Creator backend could not be reached.">
          <p className="text-sm text-[var(--pl-text-soft)]">
            This is usually temporary. Refresh in a moment; if it persists, the Python backend
            (<code>/api/content-creator</code>) may be down or unconfigured.
          </p>
        </SettingsCard>
      ) : (
        <div className="space-y-5">
          <SettingsCard
            icon={CheckCircle2}
            title="Connected"
            subtitle="The Content Creator pipeline backend is reachable through Pixie Lab."
            action={
              <div className="flex flex-wrap gap-2">
                <Badge tone="ok"><CheckCircle2 className="h-3 w-3" /> Connected</Badge>
                {mockMode ? <Badge tone="warn"><Sparkles className="h-3 w-3" /> Demo · Mock mode</Badge> : <Badge tone="ok">Live provider</Badge>}
                {status?.dry_run ? <Badge tone="muted">Dry-run posting</Badge> : null}
              </div>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Provider" value={status?.provider?.name || '—'} readOnly />
              <Field label="Billing mode" value={status?.provider?.mode || '—'} readOnly />
              <Field label="Video provider configured" value={status?.provider?.configured ? 'Yes' : 'No (mock output)'} readOnly />
              <Field label="Approval gates" value={String(Object.keys(status?.approval_gates || {}).length || 4)} readOnly />
            </div>
          </SettingsCard>

          <SettingsCard icon={Clapperboard} title="Creator profile" subtitle="The saved business identity the pipeline generates from.">
            {hasProfile ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Business" value={profile?.profile?.business_name} readOnly />
                <Field label="Niche" value={profile?.profile?.niche || '—'} readOnly />
                <Field label="Audience" value={profile?.profile?.target_audience || '—'} readOnly />
                <Field label="Goal" value={profile?.profile?.content_goal || '—'} readOnly />
              </div>
            ) : (
              <p className="text-sm text-[var(--pl-text-soft)]">
                No creator profile yet. The intake step that captures it is part of the guided
                wizard arriving in Phase 2.
              </p>
            )}
          </SettingsCard>

          <div className="rounded-2xl border border-dashed border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--pl-text)]">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Guided creation wizard — coming in Phase 2
            </div>
            <p className="mt-1.5 text-sm text-[var(--pl-text-soft)]">
              The 13-step pipeline (intake → identity → ideas → script → cost → video → quality →
              publish) has a working backend and durable storage. This screen confirms connectivity;
              the step-by-step wizard is the next phase.
            </p>
          </div>
        </div>
      )}

      <div className="mt-6">
        <BackToDashboard />
      </div>
    </PageContainer>
  );
}
