import type { MsgKey } from '../i18n';
import type { DriveConstants, Drivetrain, ProfileName } from '../model/types';

export const CALIBRATION_FIELDS = {
  minPower: [0, 0.6],
  turnMinPower: [0, 0.6],
  maxSpeedInPerSec: [5, 150],
  brakeLinear: [0, 0.5],
  brakeQuadratic: [0, 0.05],
  turnRadiusIn: [2, 20],
  maxPowerRatePerS: [0, 20],
  maxPowerDropPerS: [0, 20],
  alongPct: [0, 0.3],
  strafePct: [0, 0.3],
  turnSigmaDeg: [0, 10],
} as const satisfies Partial<Record<keyof DriveConstants, readonly [number, number]>>;

export type CalibrationKey = keyof typeof CALIBRATION_FIELDS;
export const CALIBRATION_KEYS = Object.keys(CALIBRATION_FIELDS) as CalibrationKey[];

export function robotFetchBlocked(): boolean {
  return typeof location !== 'undefined' && location.protocol === 'https:';
}

export const ROBOT_FILES_URL = 'http://192.168.43.1:10159';

export interface CalibrationFile {
  drivetrain: Drivetrain;
  profile: ProfileName | null;
  values: Partial<Pick<DriveConstants, CalibrationKey>>;
  rejected: CalibrationKey[];
  report: string[];
}

export type ParseResult = { ok: true; file: CalibrationFile } | { ok: false; error: MsgKey };

export function parseCalibration(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'calibFile.notJson' };
  }
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== 'object' || o.kind !== 'overpath-calibration') return { ok: false, error: 'calibFile.notCalibration' };
  if (typeof o.version !== 'number' || o.version > 1) return { ok: false, error: 'calibFile.newerVersion' };
  const drivetrain: Drivetrain = o.drivetrain === 'TANK' ? 'tank' : 'mecanum';
  const profile = o.profile === 'home' || o.profile === 'competition' ? o.profile : null;
  const vals = (o.values ?? {}) as Record<string, unknown>;
  const values: CalibrationFile['values'] = {};
  const rejected: CalibrationKey[] = [];
  for (const k of CALIBRATION_KEYS) {
    const v = vals[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const [lo, hi] = CALIBRATION_FIELDS[k];
    if (v < lo || v > hi) rejected.push(k);
    else values[k] = v;
  }
  const report = Array.isArray(o.report) ? o.report.filter((r): r is string => typeof r === 'string').slice(0, 20) : [];
  if (Object.keys(values).length === 0 && rejected.length === 0) return { ok: false, error: 'calibFile.empty' };
  return { ok: true, file: { drivetrain, profile, values, rejected, report } };
}

export function calibrationDiff(current: DriveConstants, file: CalibrationFile): [CalibrationKey, number, number][] {
  return CALIBRATION_KEYS.filter((k) => file.values[k] !== undefined && Math.abs(file.values[k]! - current[k]) > 1e-9).map((k) => [
    k,
    current[k],
    file.values[k]!,
  ]);
}
