'use client';

import { type RefObject } from 'react';
import { RobotHalo } from './RobotHalo';
import { RobotFormMorph } from './RobotFormMorph';

/**
 * FlyingRobot — the ONE persistent robot. Nested layers prevent transform
 * conflicts:
 *   positionRef  → scroll-driven x/y/scale/rotation (the flight)
 *   fx layer     → fixed-size robot box; hosts the halo (travels with robot)
 *   bobRef       → idle vertical bob (mascot only; ring does NOT bob)
 *   morph        → cross-fading role forms
 */
export function FlyingRobot({
  positionRef,
  bobRef,
  activeId,
  scanKey,
  idle,
  className = '',
}: {
  positionRef?: RefObject<HTMLDivElement>;
  bobRef?: RefObject<HTMLDivElement>;
  activeId: string;
  scanKey: number;
  idle: boolean;
  className?: string;
}) {
  return (
    <div ref={positionRef} className={className}>
      {/* Fixed-size robot box (drives halo + morph dimensions) */}
      <div
        className="relative"
        style={{ width: 'var(--mascot-width)', height: 'calc(var(--mascot-width) * 1.3)', maxWidth: '92vw' }}
      >
        <RobotHalo />
        <div ref={bobRef} className={`absolute inset-0 will-change-transform ${idle ? 'mh-robot-bob' : ''}`}>
          <RobotFormMorph activeId={activeId} scanKey={scanKey} />
        </div>
      </div>
    </div>
  );
}
