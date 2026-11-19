import { HALF_FIELD, footprint } from '../geometry/transform';
import { msg, type Msg } from '../i18n/translate';
import type { Auto, Pose, SimResult, ViewPrefs } from '../model/types';

export type Alliance = 'red' | 'blue';

export interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export const HIVE_KEEP_OUT: Rect = { x0: -26, x1: 26, y0: -25.5, y1: 25.5 };

export const LOADING_ZONE: Record<Alliance, Rect> = {
  blue: { x0: -72, x1: -60, y0: 24, y1: 48 },
  red: { x0: 60, x1: 72, y0: -48, y1: -24 },
};

export const FLOWERS: Circle[] = [
  { x: -24, y: 72, r: 4 },
  { x: 24, y: -72, r: 4 },
  { x: 72, y: 24, r: 4 },
  { x: -72, y: -24, r: 4 },
];

export const GARDENS: Rect[] = [
  { x0: -72, x1: -48, y0: -72, y1: -68.8 },
  { x0: 48, x1: 72, y0: 68.8, y1: 72 },
];

const WALL_CONTACT_IN = 0.75;
export const TIGHT_CLEARANCE_IN = 2;

type Pt = { x: number; y: number };

function project(poly: Pt[], ax: number, ay: number): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const d = p.x * ax + p.y * ay;
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  return [min, max];
}

export function polyHitsRect(poly: Pt[], r: Rect, margin = 0): boolean {
  const rect = [
    { x: r.x0 - margin, y: r.y0 - margin },
    { x: r.x1 + margin, y: r.y0 - margin },
    { x: r.x1 + margin, y: r.y1 + margin },
    { x: r.x0 - margin, y: r.y1 + margin },
  ];
  const axes: [number, number][] = [
    [1, 0],
    [0, 1],
  ];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    axes.push([-(b.y - a.y), b.x - a.x]);
  }
  return axes.every(([ax, ay]) => {
    const [p0, p1] = project(poly, ax, ay);
    const [q0, q1] = project(rect, ax, ay);
    return p1 > q0 && q1 > p0;
  });
}

function pointInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function polyHitsCircle(poly: Pt[], c: Circle): boolean {
  if (pointInPoly(c, poly)) return true;
  return poly.some((a, i) => segDist(c, a, poly[(i + 1) % poly.length]) < c.r);
}

export interface RuleIssue {
  level: 'error' | 'warn' | 'ok' | 'info';
  rule?: string;
  message: Msg;
  steps?: number[];
}

export interface RuleReport {
  alliance: Alliance | null;
  issues: RuleIssue[];
  badSteps: Set<number>;
}

export const AUTO_MS = 30000;
const SPARE_MS = 2000;
const DRIFT_WARN_IN = 4;

function sweep(from: Pose, to: Pose): Pose[] {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const dh = ((((to.heading - from.heading) % 360) + 540) % 360) - 180;
  const n = Math.max(1, Math.ceil(Math.max(dist, Math.abs(dh) / 10)));
  const out: Pose[] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    out.push({ x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f, heading: from.heading + dh * f });
  }
  return out;
}

export function checkAuto(auto: Auto, sim: SimResult, view: ViewPrefs): RuleReport {
  const issues: RuleIssue[] = [];
  const badSteps = new Set<number>();
  const L = view.robotLengthIn;
  const W = view.robotWidthIn;
  const start = sim.start;
  const fp = (p: Pose) => footprint(p.x, p.y, p.heading, L, W);

  const s = fp(start);
  const minX = Math.min(...s.map((p) => p.x));
  const maxX = Math.max(...s.map((p) => p.x));
  const minY = Math.min(...s.map((p) => p.y));
  const maxY = Math.max(...s.map((p) => p.y));
  const alliance: Alliance | null = maxX <= 0.01 ? 'blue' : minX >= -0.01 ? 'red' : null;

  if (L > 18 || W > 18) issues.push({ level: 'error', rule: 'R102', message: msg('rules.R102') });
  if (!alliance) issues.push({ level: 'error', rule: 'G304.A', message: msg('rules.G304A_straddle') });
  if (minX < -HALF_FIELD - 0.01 || maxX > HALF_FIELD + 0.01 || minY < -HALF_FIELD - 0.01 || maxY > HALF_FIELD + 0.01)
    issues.push({ level: 'error', rule: 'G304.A', message: msg('rules.G304A_overhang') });
  const wallGap = Math.min(minX + HALF_FIELD, HALF_FIELD - maxX, minY + HALF_FIELD, HALF_FIELD - maxY);
  if (wallGap > WALL_CONTACT_IN)
    issues.push({ level: 'error', rule: 'G304.C', message: msg('rules.G304C', { gap: wallGap.toFixed(1) }) });
  if (polyHitsRect(s, LOADING_ZONE.red) || polyHitsRect(s, LOADING_ZONE.blue))
    issues.push({ level: 'error', rule: 'G304.E', message: msg('rules.G304E') });
  if (FLOWERS.some((f) => polyHitsCircle(s, f))) issues.push({ level: 'error', rule: 'G304.D', message: msg('rules.G304D') });
  if (polyHitsRect(s, HIVE_KEEP_OUT)) issues.push({ level: 'error', rule: 'G304', message: msg('rules.G304_hive') });

  const hive: number[] = [];
  const tight: number[] = [];
  const flower: number[] = [];
  const opponent: number[] = [];
  const wallFlower: number[] = [];
  const wallGarden: number[] = [];
  const short: number[] = [];
  const notFlat: number[] = [];
  const intoWall: number[] = [];
  const add = (xs: number[], i: number) => {
    if (!xs.includes(i)) xs.push(i);
  };
  sim.steps.forEach((st) => {
    const step = auto.steps[st.index];
    if (!step || (step.kind !== 'drive' && step.kind !== 'turn' && step.kind !== 'wall')) return;
    const i = st.index;
    if (step.kind === 'wall') {
      if (st.shortOfWall) add(short, i);
      else if (step.alignHeading && !view.flatFaces.includes(step.face)) add(notFlat, i);
      if (st.contact && !st.shortOfWall) {
        const c = fp(st.contact);
        if (FLOWERS.some((f) => polyHitsCircle(c, f))) add(wallFlower, i);
        if (GARDENS.some((g) => polyHitsRect(c, g))) add(wallGarden, i);
      }
    }
    const poses =
      step.kind === 'wall' && st.contact ? [...sweep(st.from, st.contact), ...sweep(st.contact, st.to)] : sweep(st.from, st.to);
    for (const pose of poses) {
      const poly = fp(pose);
      if (polyHitsRect(poly, HIVE_KEEP_OUT)) add(hive, i);
      else if (polyHitsRect(poly, HIVE_KEEP_OUT, TIGHT_CLEARANCE_IN)) add(tight, i);
      if (step.kind !== 'wall' && FLOWERS.some((f) => polyHitsCircle(poly, f))) add(flower, i);
      if (step.kind === 'drive' && poly.some((p) => Math.abs(p.x) > HALF_FIELD + 0.5 || Math.abs(p.y) > HALF_FIELD + 0.5)) add(intoWall, i);
      if (alliance) {
        const crosses = alliance === 'blue' ? poly.some((p) => p.x > 0.01) : poly.some((p) => p.x < -0.01);
        if (crosses) add(opponent, i);
      }
    }
  });
  const list = (xs: number[]) => xs.map((i) => i + 1).join(', ');
  const flag = (xs: number[], level: RuleIssue['level'], key: Parameters<typeof msg>[0], rule?: string, bad = true, extra = {}) => {
    if (!xs.length) return;
    if (bad) xs.forEach((i) => badSteps.add(i));
    issues.push({ level, rule, message: msg(key, { steps: list(xs), ...extra }), steps: xs });
  };
  flag(hive, 'error', 'rules.G417', 'G417');
  flag(
    tight.filter((i) => !hive.includes(i)),
    'warn',
    'rules.tight',
    undefined,
    false,
    { clearance: TIGHT_CLEARANCE_IN },
  );
  flag(flower, 'warn', 'rules.G418', 'G418');
  flag(wallFlower, 'error', 'rules.wallFlower', 'G418');
  flag(wallGarden, 'warn', 'rules.wallGarden', undefined, false);
  flag(opponent, 'warn', 'rules.G402', 'G402');
  flag(short, 'warn', 'rules.short');
  flag(notFlat, 'warn', 'rules.notFlat', undefined, false);
  flag(intoWall, 'error', 'rules.outOfField');

  const secs = (sim.totalMs / 1000).toFixed(1);
  if (sim.totalMs > AUTO_MS) issues.push({ level: 'error', message: msg('rules.time', { s: secs }) });
  else if (sim.totalMs > AUTO_MS - SPARE_MS) issues.push({ level: 'warn', message: msg('rules.timeTight', { s: secs }) });
  else issues.push({ level: 'ok', message: msg('rules.timeOk', { s: secs }) });

  for (const st of sim.steps) {
    const step = auto.steps[st.index];
    if (!step || (step.kind !== 'servo' && step.kind !== 'motor' && step.kind !== 'command')) continue;
    const e2 = 2 * Math.hypot(st.sx, st.sy);
    if (e2 > DRIFT_WARN_IN) {
      issues.push({ level: 'info', message: msg('rules.drift', { e: e2.toFixed(1), step: st.index + 1 }), steps: [st.index] });
      break;
    }
  }

  const moved = sim.steps.some((st) => Math.hypot(st.to.x - start.x, st.to.y - start.y) > 1);
  issues.push(moved ? { level: 'ok', message: msg('rules.leaveOk') } : { level: 'info', message: msg('rules.leaveHint') });
  if (alliance) {
    const parked = polyHitsRect(fp(sim.end), LOADING_ZONE[alliance]);
    issues.push(
      parked
        ? { level: 'ok', message: msg(alliance === 'red' ? 'rules.parkOkRed' : 'rules.parkOkBlue') }
        : { level: 'info', message: msg(alliance === 'red' ? 'rules.parkHintRed' : 'rules.parkHintBlue') },
    );
  }
  return { alliance, issues, badSteps };
}
