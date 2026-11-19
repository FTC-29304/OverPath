import { WALL_ANGLE } from '../compile/anchors';
import type { DriveConstants, Step } from '../model/types';
import type { Timeline } from './simulate';

export interface Cov {
  xx: number;
  xy: number;
  yy: number;
  th: number;
}

export interface Ellipse {
  a: number;
  b: number;
  angleDeg: number;
}

export interface Uncertainty {
  afterStep: Cov[];
  atArrival: Cov[];
}

const ZERO: Cov = { xx: 0, xy: 0, yy: 0, th: 0 };
const D2R = Math.PI / 180;

function addAlong(p: Cov, vx: number, vy: number, sigma: number): Cov {
  const s2 = sigma * sigma;
  return { ...p, xx: p.xx + s2 * vx * vx, xy: p.xy + s2 * vx * vy, yy: p.yy + s2 * vy * vy };
}

function resetAlong(p: Cov, nx: number, ny: number, sigma: number): Cov {
  const m11 = 1 - nx * nx;
  const m12 = -nx * ny;
  const m22 = 1 - ny * ny;
  const a11 = m11 * p.xx + m12 * p.xy;
  const a12 = m11 * p.xy + m12 * p.yy;
  const a21 = m12 * p.xx + m22 * p.xy;
  const a22 = m12 * p.xy + m22 * p.yy;
  const s2 = sigma * sigma;
  return {
    ...p,
    xx: a11 * m11 + a12 * m12 + s2 * nx * nx,
    xy: a11 * m12 + a12 * m22 + s2 * nx * ny,
    yy: a21 * m12 + a22 * m22 + s2 * ny * ny,
  };
}

export function stepCov(p: Cov, step: Step, durationS: number, c: DriveConstants): Cov {
  let q = p;
  if (step.kind === 'move') {
    const h = step.from.heading * D2R;
    const dx = step.to.x - step.from.x;
    const dy = step.to.y - step.from.y;
    const d = Math.hypot(dx, dy);
    q = addAlong(q, Math.cos(h), Math.sin(h), c.alongPct * Math.abs(step.forward));
    q = addAlong(q, Math.sin(h), -Math.cos(h), c.strafePct * Math.abs(step.strafeRight));
    if (d > 1e-6) q = addAlong(q, -dy / d, dx / d, Math.sqrt(q.th) * D2R * d);
  } else if (step.kind === 'turnTo') {
    q = { ...q, th: q.th + c.turnSigmaDeg * c.turnSigmaDeg };
  } else if (step.kind === 'square') {
    const n = WALL_ANGLE[step.wall] * D2R;
    q = resetAlong(q, Math.cos(n), Math.sin(n), c.squarePosSigmaIn);
    if (step.align) q = { ...q, th: c.squareHeadingSigmaDeg * c.squareHeadingSigmaDeg };
  }
  const drift = c.headingDriftDegPerS * durationS;
  return { ...q, th: q.th + drift * drift };
}

export function propagate(steps: Step[], timeline: Timeline, c: DriveConstants, waypointCount: number): Uncertainty {
  const afterStep: Cov[] = [];
  const atArrival: Cov[] = Array.from({ length: waypointCount }, () => ZERO);
  let p = ZERO;
  steps.forEach((step, i) => {
    const dur = timeline.entries[i]?.duration ?? 0;
    p = stepCov(p, step, dur, c);
    afterStep.push(p);
    if (step.kind === 'move' || step.kind === 'square') atArrival[step.wp] = p;
  });
  let last = ZERO;
  for (let w = 0; w < waypointCount; w++) {
    if (atArrival[w] === ZERO && w > 0) atArrival[w] = last;
    last = atArrival[w];
  }
  return { afterStep, atArrival };
}

export function ellipse(p: Cov): Ellipse {
  const tr = p.xx + p.yy;
  const det = p.xx * p.yy - p.xy * p.xy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = Math.max(0, tr / 2 + disc);
  const l2 = Math.max(0, tr / 2 - disc);
  return { a: 2 * Math.sqrt(l1), b: 2 * Math.sqrt(l2), angleDeg: (0.5 * Math.atan2(2 * p.xy, p.xx - p.yy) * 180) / Math.PI };
}

export function precisionIn(p: Cov): number {
  return ellipse(p).a;
}
