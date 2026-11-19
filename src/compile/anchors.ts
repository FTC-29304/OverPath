import { HALF_FIELD, footprint, round, wrapDeg } from '../geometry/transform';
import type { Anchor, Drivetrain, Pose, RobotFace, WallSide } from '../model/types';

export const WALL_ANGLE: Record<WallSide, number> = { right: 0, audience: 90, left: 180, rear: -90 };
export const FACE_ANGLE: Record<RobotFace, number> = { front: 0, left: 90, back: 180, right: -90 };
export const WALLS: WallSide[] = ['left', 'right', 'audience', 'rear'];
export const FACES: RobotFace[] = ['front', 'back', 'left', 'right'];

export const BACK_OFF_IN = 1;
export const APPROACH_IN = 3;
export const DETECT_IN = 3;
export const DEFAULT_SQUARE_POWER = 0.3;

export interface RobotSize {
  lengthIn: number;
  widthIn: number;
}

export const DEFAULT_ROBOT: RobotSize = { lengthIn: 18, widthIn: 18 };

export function facesFor(drivetrain: Drivetrain): RobotFace[] {
  return drivetrain === 'tank' ? ['front', 'back'] : FACES;
}

export function anchorHeading(wall: WallSide, face: RobotFace): number {
  return wrapDeg(WALL_ANGLE[wall] - FACE_ANGLE[face]);
}

function halfDepth(face: RobotFace, r: RobotSize): number {
  return (face === 'front' || face === 'back' ? r.lengthIn : r.widthIn) / 2;
}

function halfSpan(face: RobotFace, r: RobotSize): number {
  return (face === 'front' || face === 'back' ? r.widthIn : r.lengthIn) / 2;
}

export function alongWall(wall: WallSide, x: number, y: number): number {
  return wall === 'left' || wall === 'right' ? y : x;
}

export function contactPose(wall: WallSide, face: RobotFace, along: number, r: RobotSize): Pose {
  const c = HALF_FIELD - halfDepth(face, r);
  const lim = HALF_FIELD - halfSpan(face, r);
  const a = round(Math.max(-lim, Math.min(lim, along)), 2);
  const heading = anchorHeading(wall, face);
  switch (wall) {
    case 'left':
      return { x: -c, y: a, heading };
    case 'right':
      return { x: c, y: a, heading };
    case 'audience':
      return { x: a, y: c, heading };
    case 'rear':
      return { x: a, y: -c, heading };
  }
}

export function offWall(p: Pose, wall: WallSide, d: number): Pose {
  const n = (WALL_ANGLE[wall] * Math.PI) / 180;
  return { x: round(p.x - Math.cos(n) * d, 2), y: round(p.y - Math.sin(n) * d, 2), heading: p.heading };
}

export function snapToAnchor(x: number, y: number, a: Anchor, r: RobotSize): Pose {
  return contactPose(a.wall, a.face, alongWall(a.wall, x, y), r);
}

export function detectWall(
  x: number,
  y: number,
  heading: number,
  r: RobotSize,
  drivetrain: Drivetrain,
): { wall: WallSide; face: RobotFace; gap: number } | null {
  const corners = footprint(x, y, heading, r.lengthIn, r.widthIn);
  let best: { wall: WallSide; gap: number } | null = null;
  for (const wall of WALLS) {
    const n = (WALL_ANGLE[wall] * Math.PI) / 180;
    const reach = Math.max(...corners.map((c) => c.x * Math.cos(n) + c.y * Math.sin(n)));
    const gap = HALF_FIELD - reach;
    if (gap <= DETECT_IN && (!best || gap < best.gap)) best = { wall, gap };
  }
  if (!best) return null;
  const wall = best.wall;
  const face = facesFor(drivetrain).reduce((a, b) =>
    Math.abs(wrapDeg(heading + FACE_ANGLE[a] - WALL_ANGLE[wall])) <= Math.abs(wrapDeg(heading + FACE_ANGLE[b] - WALL_ANGLE[wall])) ? a : b,
  );
  return { wall, face, gap: best.gap };
}
