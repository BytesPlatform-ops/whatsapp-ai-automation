'use client';

import { useEffect, useState } from 'react';
import { Clapperboard } from 'lucide-react';
import { ServiceGate } from '@/components/pixie-lab/services/ServiceGate';
import { ServiceTabs } from '@/components/pixie-lab/services/ServiceTabs';
import { ContentCreatePanel } from './ContentCreatePanel';
import { ContentLibraryPanel } from './ContentLibraryPanel';
import { contentApi } from '@/lib/pixie-lab/servicesClient';
import { OfflineState, SetupRequired, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import type { StorageStatus, Envelope } from '@/lib/pixie-lab/serviceTypes';

const ACCENT = '#D4AF37';

const TABS = [
  { label: 'Overview', href: '/pixie-lab/content' },
  { label: 'Create', href: '/pixie-lab/content/create' },
  { label: 'Library', href: '/pixie-lab/content/library' },
];

type ContentTab = 'create' | 'library';
type StorageState = 'loading' | 'offline' | 'unconfigured' | 'ready';

/**
 * ContentWorkspace — real Content agent tools inside the Pixie Lab shell.
 * Fetches storage status once to gate the panels: offline → OfflineState,
 * unconfigured → SetupRequired, ready → renders the active tab panel.
 * All data flows through /api/lab/content/* proxies via contentApi.
 */
export function ContentWorkspace({ tab, tenant }: { tab: ContentTab; tenant: string }) {
  const [storageState, setStorageState] = useState<StorageState>('loading');
  const [storage, setStorage] = useState<Envelope<StorageStatus> | null>(null);

  useEffect(() => {
    contentApi.storage().then((d) => {
      setStorage(d);
      if (!d.backendUp) { setStorageState('offline'); return; }
      if (d.configured === false) { setStorageState('unconfigured'); return; }
      setStorageState('ready');
    });
  }, []);

  const tabTitle = tab === 'create' ? 'Upload Media' : 'Asset Library';

  return (
    <ServiceGate agent="content" tenant={tenant}>
      <main className="mx-auto w-full max-w-4xl px-[clamp(20px,4vw,52px)] py-9 text-[var(--pl-text)]">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span
            className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--pl-border)]"
            style={{ background: `${ACCENT}1a`, color: ACCENT }}
          >
            <Clapperboard size={20} />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--pl-text-muted)]">
              Content Agent
            </p>
            <h1 className="font-display text-[clamp(1.5rem,3vw,2rem)] font-extrabold leading-tight tracking-tight">
              {tabTitle}
            </h1>
          </div>
        </div>

        <ServiceTabs tabs={TABS} accent={ACCENT} />

        <div className="mt-6">
          {storageState === 'loading' && <LoadingCards count={3} height="h-24" />}

          {storageState === 'offline' && <OfflineState service="Content" />}

          {storageState === 'unconfigured' && (
            <SetupRequired
              title="Media storage isn't configured"
              body="An admin must set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or PIXIE_STORAGE_PROVIDER=local) in the backend environment before media can be stored."
            />
          )}

          {storageState === 'ready' && storage !== null && (
            <>
              {tab === 'create' && <ContentCreatePanel />}
              {tab === 'library' && <ContentLibraryPanel storage={storage} />}
            </>
          )}
        </div>
      </main>
    </ServiceGate>
  );
}
