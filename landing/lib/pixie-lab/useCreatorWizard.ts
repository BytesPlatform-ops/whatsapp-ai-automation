'use client';

/**
 * Wizard state hook — backend is authoritative. On mount (and after any mutation)
 * it loads /wizard-state, reconstructs progress, and resumes on the correct stage.
 * Refresh, sign-out/in and backend restart all reconstruct from durable data
 * because nothing here persists progress client-side (only the transient UI-selected
 * stage lives in React state). AbortController cancels in-flight loads on unmount.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getWizardState, type CreatorError } from './contentCreatorClient';
import { isNavigable, resumeStage } from './wizardNav';
import type { CreatorStage, WizardState } from './contentCreatorTypes';

export interface CreatorWizard {
  loading: boolean;
  reloading: boolean;
  error: CreatorError | null;
  state: WizardState | null;
  activeStage: CreatorStage | null;
  goTo: (stage: CreatorStage) => void;
  reload: () => Promise<WizardState | null>;
  /** reload then move to the current (first-incomplete) stage — used after a save */
  advance: () => Promise<void>;
}

export function useCreatorWizard(): CreatorWizard {
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<CreatorError | null>(null);
  const [state, setState] = useState<WizardState | null>(null);
  const [activeStage, setActiveStage] = useState<CreatorStage | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stickyRef = useRef(false); // once the user picks a stage, don't yank them around

  const load = useCallback(async (): Promise<WizardState | null> => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const res = await getWizardState(ac.signal).catch(() => null);
    if (ac.signal.aborted || res === null) return null;
    if (!res.ok) {
      setError(res.error);
      return null;
    }
    setError(null);
    setState(res.data);
    return res.data;
  }, []);

  // initial load
  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await load();
      if (!alive) return;
      if (s) setActiveStage((prev) => (prev && isNavigable(s, prev) ? prev : resumeStage(s)));
      setLoading(false);
    })();
    return () => {
      alive = false;
      abortRef.current?.abort();
    };
  }, [load]);

  const reload = useCallback(async () => {
    setReloading(true);
    const s = await load();
    setReloading(false);
    if (s && activeStage && !isNavigable(s, activeStage)) {
      setActiveStage(resumeStage(s));
    }
    return s;
  }, [load, activeStage]);

  const advance = useCallback(async () => {
    const s = await reload();
    if (s && !stickyRef.current) setActiveStage(resumeStage(s));
  }, [reload]);

  const goTo = useCallback((stage: CreatorStage) => {
    stickyRef.current = true;
    setState((s) => {
      if (s && isNavigable(s, stage)) setActiveStage(stage);
      return s;
    });
  }, []);

  return { loading, reloading, error, state, activeStage, goTo, reload, advance };
}
