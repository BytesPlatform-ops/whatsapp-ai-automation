/**
 * Per-role avatar side-flight entrance for the mobile role scenes. The avatar
 * flies in from alternating sides (left/right; Core drops from above) and
 * settles to x:0 y:0 rot:0 scale:1. Driven by CSS custom properties + the
 * `mAvatarFlyIn` keyframe (transform/opacity only) — no GSAP on mobile.
 */
export interface AvatarEntrance {
  fromX: number; // px
  fromY: number; // px
  fromRotate: number; // deg
  fromScale: number;
}

export const MOBILE_AVATAR_ENTRANCE: Record<string, AvatarEntrance> = {
  greeter: { fromX: -96, fromY: 36, fromRotate: -7, fromScale: 0.9 },
  architect: { fromX: 96, fromY: 32, fromRotate: 7, fromScale: 0.9 },
  creator: { fromX: -88, fromY: 42, fromRotate: -6, fromScale: 0.88 },
  star: { fromX: 96, fromY: 30, fromRotate: 6, fromScale: 0.9 },
  analyst: { fromX: -78, fromY: 28, fromRotate: -5, fromScale: 0.92 },
  core: { fromX: 0, fromY: 56, fromRotate: 0, fromScale: 0.84 },
};

/** CSS custom props for a role's entrance, applied to `.m-avatar-entrance`. */
export function entranceVars(roleId: string): React.CSSProperties {
  const e = MOBILE_AVATAR_ENTRANCE[roleId] ?? MOBILE_AVATAR_ENTRANCE.greeter;
  return {
    ['--from-x' as string]: `${e.fromX}px`,
    ['--from-y' as string]: `${e.fromY}px`,
    ['--from-rot' as string]: `${e.fromRotate}deg`,
    ['--from-scale' as string]: `${e.fromScale}`,
  };
}
