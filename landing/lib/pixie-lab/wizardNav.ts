/**
 * Pure wizard navigation logic derived from the backend-authoritative WizardState.
 * No React, no fetch — unit-testable. The backend computes per-stage status
 * (complete/current/locked) and the current stage; these helpers decide what the
 * user may navigate to and render progress, so backend state stays authoritative
 * and refresh/relogin/restart always reconstruct the same view.
 */

import { STAGES, type CreatorStage, type StageStatus, type WizardStageView, type WizardState } from './contentCreatorTypes';

export const STAGE_ORDER: CreatorStage[] = STAGES.map((s) => s.stage);

export function indexOfStage(stage: CreatorStage): number {
  return STAGE_ORDER.indexOf(stage);
}

export function stageView(state: WizardState, stage: CreatorStage): WizardStageView | undefined {
  return state.stages.find((s) => s.stage === stage);
}

export function stageStatus(state: WizardState, stage: CreatorStage): StageStatus {
  return stageView(state, stage)?.status ?? 'locked';
}

/** A stage is navigable when it is completed or the current stage — never a locked
 *  (not-yet-reachable) future stage. This enforces "cannot skip required stages"
 *  while allowing revisiting completed ones. */
export function isNavigable(state: WizardState, stage: CreatorStage): boolean {
  const st = stageStatus(state, stage);
  return st === 'complete' || st === 'current';
}

export function progressPercent(state: WizardState): number {
  if (!state.total_stages) return 0;
  return Math.round((state.completed_count / state.total_stages) * 100);
}

export function nextStage(from: CreatorStage): CreatorStage | null {
  const i = indexOfStage(from);
  return i >= 0 && i + 1 < STAGE_ORDER.length ? STAGE_ORDER[i + 1] : null;
}

export function prevStage(from: CreatorStage): CreatorStage | null {
  const i = indexOfStage(from);
  return i > 0 ? STAGE_ORDER[i - 1] : null;
}

/** The stage the wizard should open on: the resolved current stage, clamped to a
 *  navigable one (defends against a corrupt/unknown current_stage). */
export function resumeStage(state: WizardState): CreatorStage {
  const cur = state.current_stage;
  if (STAGE_ORDER.includes(cur) && isNavigable(state, cur)) return cur;
  // fall back to the last completed stage, else the very first stage
  const completed = state.stages.filter((s) => s.status === 'complete');
  if (completed.length) return completed[completed.length - 1].stage;
  return STAGE_ORDER[0];
}

/** Highest completed stage number (for "furthest reached" display). */
export function furthestCompletedN(state: WizardState): number {
  return state.stages.filter((s) => s.done).reduce((mx, s) => Math.max(mx, s.n), 0);
}
