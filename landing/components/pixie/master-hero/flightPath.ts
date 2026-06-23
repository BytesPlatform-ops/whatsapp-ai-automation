/**
 * Flight path for the persistent Pixie robot. Each point is a position in
 * VIEWPORT PERCENT (x = % of width, y = % of height) plus scale/rotation and
 * which side the role panel sits on. Index 0 is the intro hub; 1–6 are roles.
 */
export interface FlightPoint {
  key: string;
  roleId: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  panelSide: 'left' | 'right' | 'center' | null;
}

// Strictly alternating sides (no two consecutive role stops share a side), so
// the robot visibly criss-crosses the screen as it flies. Panel side is always
// OPPOSITE the robot.
export const FLIGHT_PATH: FlightPoint[] = [
  { key: 'intro', roleId: 'intro', x: 50, y: 44, scale: 1.0, rotation: 0, panelSide: null },
  { key: 'greeter', roleId: 'greeter', x: 30, y: 58, scale: 0.92, rotation: -6, panelSide: 'right' },
  { key: 'architect', roleId: 'architect', x: 70, y: 40, scale: 0.95, rotation: 6, panelSide: 'left' },
  { key: 'creator', roleId: 'creator', x: 28, y: 46, scale: 0.92, rotation: -5, panelSide: 'right' },
  { key: 'star', roleId: 'star', x: 72, y: 58, scale: 0.95, rotation: 5, panelSide: 'left' },
  { key: 'analyst', roleId: 'analyst', x: 30, y: 40, scale: 0.92, rotation: -6, panelSide: 'right' },
  { key: 'core', roleId: 'core', x: 50, y: 46, scale: 1.05, rotation: 0, panelSide: 'center' },
];

export function getViewportPoint(p: FlightPoint, w: number, h: number) {
  return { x: (w * p.x) / 100, y: (h * p.y) / 100 };
}

/**
 * Document-space anchors. The robot is an absolute element inside the tall
 * scroll container; GSAP animates its transform to `sectionTop + h*yRatio`
 * (document-relative Y that INCREASES per section) so it genuinely flies DOWN
 * the page through real stacked sections — not locked to one viewport screen.
 * Sides strictly alternate; the role panel sits OPPOSITE the robot.
 */
export type Side = 'left' | 'right' | 'center';

export interface Anchor {
  key: string;
  roleId: string;
  side: Side;
  yRatio: number;
  scale: number;
  rot: number;
}

export const ANCHORS: Anchor[] = [
  { key: 'intro', roleId: 'intro', side: 'center', yRatio: 0.31, scale: 1.12, rot: 0 },
  { key: 'greeter', roleId: 'greeter', side: 'left', yRatio: 0.52, scale: 0.92, rot: -6 },
  { key: 'architect', roleId: 'architect', side: 'right', yRatio: 0.42, scale: 0.95, rot: 6 },
  { key: 'creator', roleId: 'creator', side: 'left', yRatio: 0.48, scale: 0.92, rot: -5 },
  { key: 'star', roleId: 'star', side: 'right', yRatio: 0.56, scale: 0.95, rot: 5 },
  { key: 'analyst', roleId: 'analyst', side: 'left', yRatio: 0.42, scale: 0.92, rot: -6 },
  { key: 'core', roleId: 'core', side: 'right', yRatio: 0.48, scale: 0.95, rot: 5 },
  // Final landing: the robot flies into the footer + morphs back to normal Pixie.
  { key: 'footer-normal', roleId: 'normal', side: 'center', yRatio: 0.42, scale: 0.7, rot: 0 },
];

/** Panel side = opposite the robot. */
export function oppositeSide(side: Side): Side {
  return side === 'left' ? 'right' : side === 'right' ? 'left' : 'center';
}

const SIDE_X: Record<Side, number> = { left: 0.28, right: 0.72, center: 0.5 };

/** Live document-space anchor from a section element. */
export function anchorPoint(sectionEl: HTMLElement | null, a: Anchor, index: number) {
  const vw = window.innerWidth;
  const top = sectionEl ? sectionEl.offsetTop : index * window.innerHeight;
  const h = sectionEl ? sectionEl.offsetHeight : window.innerHeight;
  return { x: vw * SIDE_X[a.side], y: top + h * a.yRatio, scale: a.scale, rot: a.rot };
}
