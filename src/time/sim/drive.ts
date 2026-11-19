import type { Calibration } from '../model/types';

const RAD = Math.PI / 180;

export function powerScale(cal: Calibration, power: number): number {
  const span = cal.calPower - cal.minPower;
  if (span <= 0) return 0;
  return Math.max(0, Math.abs(power) - cal.minPower) / span;
}

export function robotVelocity(cal: Calibration, dirDeg: number, power: number): { f: number; l: number } {
  const c = Math.cos(dirDeg * RAD);
  const s = Math.sin(dirDeg * RAD);
  const n = Math.abs(c) + Math.abs(s) || 1;
  const k = powerScale(cal, power);
  return { f: (cal.forwardInPerSec * k * c) / n + 0, l: (cal.strafeInPerSec * k * s) / n + 0 };
}

export function extraMs(cal: Calibration, dirDeg: number): number {
  const c = Math.cos(dirDeg * RAD);
  const s = Math.sin(dirDeg * RAD);
  return cal.forwardExtraMs * c * c + cal.strafeExtraMs * s * s;
}

export function driveDisplacement(cal: Calibration, dirDeg: number, power: number, ms: number): { f: number; l: number } {
  if (ms <= 0) return { f: 0, l: 0 };
  const v = robotVelocity(cal, dirDeg, power);
  const tSec = Math.max(0, ms + extraMs(cal, dirDeg)) / 1000;
  return { f: v.f * tSec, l: v.l * tSec };
}

export function speedAlong(cal: Calibration, dirDeg: number, power: number): number {
  const v = robotVelocity(cal, dirDeg, power);
  return Math.hypot(v.f, v.l);
}

export function msForDistance(cal: Calibration, dirDeg: number, power: number, distIn: number): number | null {
  const v = speedAlong(cal, dirDeg, power);
  if (v <= 1e-9) return null;
  return Math.max(1, Math.round((distIn / v) * 1000 - extraMs(cal, dirDeg)));
}

export function solveDrive(
  cal: Calibration,
  f: number,
  l: number,
  power: number,
  snapDeg = 0,
): { dirDeg: number; ms: number } | null {
  const dist = Math.hypot(f, l);
  if (dist < 1e-6 || powerScale(cal, power) <= 0 || cal.forwardInPerSec <= 0 || cal.strafeInPerSec <= 0) return null;
  let dir = Math.atan2(l / cal.strafeInPerSec, f / cal.forwardInPerSec) / RAD;
  let along = dist;
  if (snapDeg > 0) {
    const snapped = Math.round(dir / 45) * 45;
    if (Math.abs(dir - snapped) <= snapDeg) {
      dir = snapped;
      const v = robotVelocity(cal, dir, power);
      const sp = Math.hypot(v.f, v.l);
      along = Math.max(0, (f * v.f + l * v.l) / sp);
    }
  }
  dir = Math.round(dir * 10) / 10;
  if (dir <= -180) dir += 360;
  const ms = msForDistance(cal, dir, power, along);
  return ms == null ? null : { dirDeg: dir + 0, ms };
}

export function turnMs(cal: Calibration, deltaDeg: number, power: number, tolDeg: number, timeoutMs: number): number {
  const d = Math.abs(deltaDeg);
  if (d <= tolDeg) return 0;
  const rate = cal.turnDegPerSec * powerScale(cal, power);
  if (rate <= 1e-9) return timeoutMs;
  return Math.min(timeoutMs, Math.round((d / rate) * 1000 + 250));
}

export function fitRuns(t1Ms: number, d1: number, t2Ms: number, d2: number): { inPerSec: number; extraMs: number } | null {
  if (!(t2Ms > t1Ms) || !(d2 > d1) || d1 <= 0) return null;
  const v = (d2 - d1) / ((t2Ms - t1Ms) / 1000);
  const extra = (d1 / v) * 1000 - t1Ms;
  return { inPerSec: Math.round(v * 100) / 100, extraMs: Math.round(extra) };
}
