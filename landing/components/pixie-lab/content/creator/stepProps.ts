import type { WizardState, CreatorStage } from '@/lib/pixie-lab/contentCreatorTypes';
import { INVALIDATES } from '@/lib/pixie-lab/contentCreatorTypes';

export interface StepProps {
  state: WizardState;
  /** re-fetch the authoritative wizard state (after a mutation) */
  reload: () => Promise<WizardState | null>;
  /** reload then move to the first-incomplete stage (after completing a step) */
  advance: () => Promise<void>;
  /** jump to a navigable stage */
  goTo: (stage: CreatorStage) => void;
}

/** The downstream gates that are currently APPROVED and would be reset by editing
 *  `stage`. Empty when nothing downstream is at risk (so no warning is needed). */
export function staleGatesFor(state: WizardState, stage: CreatorStage): string[] {
  const gates = INVALIDATES[stage] ?? [];
  return gates.filter((g) => state.gates[g] === 'approved');
}
