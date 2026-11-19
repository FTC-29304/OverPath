import { BACK_OFF_IN } from '../compile/anchors';
import { wrapDeg } from '../geometry/transform';
import type { DriveConstants, Drivetrain, Pose, Step } from '../model/types';

export const AUTO_SECONDS = 30;
const TURN_SETTLE_S = 0.15;
const SQUARE_STALL_S = 0.4;
const SQUARE_SETTLE_S = 0.25;

export function squareTiming(step: Extract<Step, { kind: 'square' }>, c: DriveConstants) {
  const approach = Math.hypot(step.contact.x - step.from.x, step.contact.y - step.from.y);
  const tApproach = approach / Math.max(1, step.power * c.maxSpeedInPerSec);
  const tPush = SQUARE_STALL_S + SQUARE_SETTLE_S;
  const tBack = BACK_OFF_IN / Math.max(1, Math.max(c.minPower, step.power * 0.6) * c.maxSpeedInPerSec);
  return { tApproach, tPush, tBack, total: tApproach + tPush + tBack };
}
const SAMPLES = 48;
export const MAX_DRIVE_POWER = 0.9;
const FINISH_S = 0.3;
const DT = 0.01;

export type MoveEnd = 'flow' | 'corner' | 'settle';

export function moveEnd(steps: Step[], index: number): MoveEnd {
  const s = steps[index];
  const n = steps[index + 1];
  if (!n || n.kind !== 'move' || s.kind !== 'move') return 'settle';
  const ax = s.to.x - s.from.x;
  const ay = s.to.y - s.from.y;
  const bx = n.to.x - s.to.x;
  const by = n.to.y - s.to.y;
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (la < 1e-6 || lb < 1e-6) return 'corner';
  return (ax * bx + ay * by) / (la * lb) >= Math.cos(Math.PI / 6) ? 'flow' : 'corner';
}

export function stopDistance(v: number, c: DriveConstants): number {
  const s = Math.abs(v);
  return Math.max(0, c.brakeLinear * s + c.brakeQuadratic * s * s);
}

export function moveTiming(total: number, power: number, c: DriveConstants, mag0: number, end: MoveEnd) {
  const times = [0];
  let s = 0;
  let t = 0;
  let mag = mag0;
  const mark = () => {
    while (times.length <= SAMPLES && s >= (times.length / SAMPLES) * total - 1e-9) times.push(t);
  };
  while (s < total && t < AUTO_SECONDS) {
    const v = mag * c.maxSpeedInPerSec;
    if (end !== 'flow' && total - s <= stopDistance(v, c) && t > 0) break;
    const want = Math.min(profilePower(s, total, power, c.minPower, c.rampIn), MAX_DRIVE_POWER);
    if (want > mag) mag = c.maxPowerRatePerS > 0 ? Math.min(want, mag + c.maxPowerRatePerS * DT) : want;
    else mag = c.maxPowerDropPerS > 0 ? Math.max(want, mag - c.maxPowerDropPerS * DT) : want;
    s += mag * c.maxSpeedInPerSec * DT;
    t += DT;
    mark();
  }
  if (end !== 'flow') {
    const roll = (c.maxPowerDropPerS > 0 ? mag / c.maxPowerDropPerS : 0) + 0.1;
    const left = Math.max(0, total - s);
    const t0 = t;
    while (times.length <= SAMPLES) {
      const f = left > 1e-9 ? ((times.length / SAMPLES) * total - s) / left : 1;
      times.push(t0 + roll * Math.min(1, Math.max(0, f)));
    }
    t += roll + (end === 'settle' ? FINISH_S : 0);
    mag = 0;
  }
  while (times.length <= SAMPLES) times.push(t);
  return { duration: t, progressTimes: times, magOut: mag };
}

export function profilePower(s: number, total: number, power: number, minPower: number, rampIn: number): number {
  const p = Math.abs(power);
  if (p <= minPower || rampIn <= 0) return p;
  const up = minPower + ((p - minPower) * Math.max(0, s)) / rampIn;
  const down = minPower + ((p - minPower) * Math.max(0, total - s)) / rampIn;
  return Math.min(p, Math.max(minPower, Math.min(up, down)));
}

export function wheelTravel(forward: number, strafeRight: number, drivetrain: Drivetrain, strafeMultiplier: number): number {
  if (drivetrain === 'tank') return Math.abs(forward);
  const s = strafeRight * strafeMultiplier;
  return Math.max(Math.abs(forward + s), Math.abs(forward - s));
}

export interface TimelineEntry {
  step: Step;
  index: number;
  start: number;
  duration: number;
  progressTimes?: number[];
  background?: number;
}

export interface Timeline {
  entries: TimelineEntry[];
  total: number;
  sequenceEnd: number;
}

export function simulate(steps: Step[], drivetrain: Drivetrain, c: DriveConstants): Timeline {
  const entries: TimelineEntry[] = [];
  let t = 0;
  let backgroundEnd = 0;
  let carried = 0;
  steps.forEach((step, index) => {
    let duration = 0;
    let progressTimes: number[] | undefined;
    switch (step.kind) {
      case 'move': {
        const total = wheelTravel(step.forward, step.strafeRight, drivetrain, c.strafeMultiplier);
        const m = moveTiming(total, step.power, c, carried, moveEnd(steps, index));
        progressTimes = m.progressTimes;
        duration = m.duration;
        carried = m.magOut;
        break;
      }
      case 'turnTo': {
        const delta = Math.abs(wrapDeg(step.heading - step.from.heading));
        duration = delta / Math.max(1, c.turnRateDegPerSec * Math.abs(step.power) * 0.8) + TURN_SETTLE_S;
        break;
      }
      case 'square':
        duration = squareTiming(step, c).total;
        break;
      case 'wait':
        duration = step.ms / 1000;
        break;
      case 'motor':
      case 'command':
        if (step.background) backgroundEnd = Math.max(backgroundEnd, t + step.ms / 1000);
        else duration = step.ms / 1000;
        break;
      default:
        duration = 0;
    }
    if (step.kind !== 'move') carried = 0;
    const background = (step.kind === 'motor' || step.kind === 'command') && step.background ? step.ms / 1000 : undefined;
    entries.push({ step, index, start: t, duration, progressTimes, background });
    t += duration;
  });
  return { entries, total: Math.max(t, backgroundEnd), sequenceEnd: t };
}

function lerp(a: number, b: number, f: number) {
  return a + (b - a) * f;
}

export function poseAt(tl: Timeline, time: number, fallback: Pose, c?: DriveConstants): { pose: Pose; index: number } {
  if (tl.entries.length === 0) return { pose: fallback, index: -1 };
  for (const e of tl.entries) {
    if (time > e.start + e.duration) continue;
    const { step } = e;
    const local = Math.max(0, time - e.start);
    let f = e.duration > 0 ? local / e.duration : 1;
    if (step.kind === 'move' && e.progressTimes) {
      const pt = e.progressTimes;
      let i = 1;
      while (i < pt.length - 1 && pt[i] < local) i++;
      const seg = pt[i] - pt[i - 1];
      f = (i - 1 + (seg > 0 ? (local - pt[i - 1]) / seg : 1)) / (pt.length - 1);
    }
    f = Math.min(1, Math.max(0, f));
    if (step.kind === 'square' && c) {
      const st = squareTiming(step, c);
      const p = local <= st.tApproach ? local / Math.max(1e-6, st.tApproach) : 1;
      const back = local > st.tApproach + st.tPush ? Math.min(1, (local - st.tApproach - st.tPush) / Math.max(1e-6, st.tBack)) : 0;
      const at = back > 0 ? { x: lerp(step.contact.x, step.to.x, back), y: lerp(step.contact.y, step.to.y, back) } : { x: lerp(step.from.x, step.contact.x, p), y: lerp(step.from.y, step.contact.y, p) };
      return { pose: { ...at, heading: step.contact.heading }, index: e.index };
    }
    if (step.kind === 'turnTo') {
      const turnPart = e.duration > TURN_SETTLE_S ? Math.min(1, local / (e.duration - TURN_SETTLE_S)) : 1;
      const eased = 1 - (1 - turnPart) * (1 - turnPart);
      const d = wrapDeg(step.to.heading - step.from.heading);
      return { pose: { ...step.from, heading: wrapDeg(step.from.heading + d * eased) }, index: e.index };
    }
    return {
      pose: { x: lerp(step.from.x, step.to.x, f), y: lerp(step.from.y, step.to.y, f), heading: step.to.heading },
      index: e.index,
    };
  }
  const last = tl.entries[tl.entries.length - 1];
  return { pose: last.step.to, index: last.index };
}
