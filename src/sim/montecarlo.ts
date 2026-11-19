import { WALL_ANGLE, type RobotSize } from '../compile/anchors';
import { footprint } from '../geometry/transform';
import type { DriveConstants, Pose, Step } from '../model/types';
import { HIVE_KEEP_OUT, LOADING_ZONE, polyHitsRect, type Alliance } from '../rules/biobuzz';
import type { Timeline } from './simulate';

export interface RealityCheck {
  runs: number;
  points: { x: number; y: number }[][];
  parkPct: number | null;
  hivePct: number;
  endSpread95: number;
}

export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => {
    const u = Math.max(1e-12, next());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  return { next, gauss };
}

const D2R = Math.PI / 180;

export function realityCheck(
  steps: Step[],
  arrivals: Pose[],
  timeline: Timeline,
  c: DriveConstants,
  robot: RobotSize,
  alliance: Alliance | null,
  runs = 300,
  seed = 9483,
): RealityCheck {
  const r = rng(seed);
  const points: { x: number; y: number }[][] = arrivals.map(() => []);
  let parked = 0;
  let hive = 0;
  const endErr: number[] = [];
  const hits = (x: number, y: number, h: number) => polyHitsRect(footprint(x, y, h, robot.lengthIn, robot.widthIn), HIVE_KEEP_OUT);

  for (let run = 0; run < runs; run++) {
    let ex = 0;
    let ey = 0;
    let dth = 0;
    let hitHive = false;
    const seen = new Set<number>();
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const dur = timeline.entries[i]?.duration ?? 0;
      const ex0 = ex;
      const ey0 = ey;
      if (s.kind === 'move') {
        const h = s.from.heading * D2R;
        const dx = s.to.x - s.from.x;
        const dy = s.to.y - s.from.y;
        const t = dth * D2R;
        ex += dx * Math.cos(t) - dy * Math.sin(t) - dx;
        ey += dx * Math.sin(t) + dy * Math.cos(t) - dy;
        const sf = r.gauss() * c.alongPct * s.forward;
        const ss = r.gauss() * c.strafePct * s.strafeRight;
        ex += sf * Math.cos(h) + ss * Math.sin(h);
        ey += sf * Math.sin(h) - ss * Math.cos(h);
        if (!hitHive) {
          for (const f of [0.5, 1]) {
            const px = s.from.x + dx * f + ex0 + (ex - ex0) * f;
            const py = s.from.y + dy * f + ey0 + (ey - ey0) * f;
            if (hits(px, py, s.from.heading + dth)) hitHive = true;
          }
        }
      } else if (s.kind === 'turnTo') {
        if (!hitHive) {
          const delta = ((((s.heading - s.from.heading) % 360) + 540) % 360) - 180;
          const n = Math.max(1, Math.ceil(Math.abs(delta) / 15));
          for (let k = 0; k <= n && !hitHive; k++) {
            if (hits(s.from.x + ex, s.from.y + ey, s.from.heading + (delta * k) / n + dth)) hitHive = true;
          }
        }
        dth += r.gauss() * c.turnSigmaDeg;
      } else if (s.kind === 'square') {
        const n = WALL_ANGLE[s.wall] * D2R;
        const nx = Math.cos(n);
        const ny = Math.sin(n);
        const along = ex * nx + ey * ny;
        const fresh = r.gauss() * c.squarePosSigmaIn;
        ex += (fresh - along) * nx;
        ey += (fresh - along) * ny;
        if (s.align) dth = r.gauss() * c.squareHeadingSigmaDeg;
      }
      dth += r.gauss() * c.headingDriftDegPerS * dur;
      if (s.kind === 'move' || s.kind === 'square') {
        seen.add(s.wp);
        points[s.wp][run] = { x: s.to.x + ex, y: s.to.y + ey };
      }
    }
    for (let w = 0; w < arrivals.length; w++) {
      if (!points[w][run]) points[w][run] = w === 0 || !seen.has(w) ? { x: arrivals[w].x + (w === 0 ? 0 : ex), y: arrivals[w].y + (w === 0 ? 0 : ey) } : points[w][run];
    }
    if (hitHive) hive++;
    const end = arrivals[arrivals.length - 1];
    if (end) {
      endErr.push(Math.hypot(ex, ey));
      if (alliance && polyHitsRect(footprint(end.x + ex, end.y + ey, end.heading + dth, robot.lengthIn, robot.widthIn), LOADING_ZONE[alliance])) parked++;
    }
  }
  endErr.sort((a, b) => a - b);
  return {
    runs,
    points,
    parkPct: alliance ? (100 * parked) / runs : null,
    hivePct: (100 * hive) / runs,
    endSpread95: endErr.length ? endErr[Math.min(endErr.length - 1, Math.floor(0.95 * endErr.length))] : 0,
  };
}
