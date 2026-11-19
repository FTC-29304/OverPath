import type { RunRecord } from '../logs/learn';
import type { WallSample } from '../logs/runLog';
import { defaultConfig, defaultView, uid } from './defaults';
import type {
  Action,
  Anchor,
  Auto,
  CalibValues,
  DriveConstants,
  HardwareConfig,
  Marker,
  MarkerAction,
  Mechanism,
  ProfileName,
  RobotFace,
  ViewPrefs,
  WallSide,
  Waypoint,
} from './types';
import { CALIB_KEYS } from './types';

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, def: number, lo = -Infinity, hi = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;
const str = (v: unknown, def = '') => (typeof v === 'string' ? v : def);
const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
const oneOf = <T>(v: unknown, options: readonly T[], def: T): T => (options.includes(v as T) ? (v as T) : def);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const FIELD = 72;
const WALLS: WallSide[] = ['left', 'right', 'audience', 'rear'];
const FACES: RobotFace[] = ['front', 'back', 'left', 'right'];
const PROFILES: ProfileName[] = ['home', 'competition'];

function freshId(v: unknown, prefix: string, seen: Set<string>): string {
  const id = typeof v === 'string' && v && !seen.has(v) ? v : uid(prefix);
  seen.add(id);
  return id;
}

function sanitizeMarkerAction(raw: unknown): MarkerAction | null {
  if (!isObj(raw)) return null;
  if (raw.kind === 'servo') return { kind: 'servo', mechanismId: str(raw.mechanismId), position: num(raw.position, 0.5, 0, 1) };
  if (raw.kind === 'motor') return { kind: 'motor', mechanismId: str(raw.mechanismId), power: num(raw.power, 0, -1, 1) };
  if (raw.kind === 'command' && typeof raw.name === 'string') return { kind: 'command', name: raw.name };
  return null;
}

function sanitizeAction(raw: unknown, seen: Set<string>): Action | null {
  if (!isObj(raw)) return null;
  const id = () => freshId(raw.id, 'act', seen);
  switch (raw.kind) {
    case 'wait':
      return { id: id(), kind: 'wait', ms: num(raw.ms, 500, 0, 30000) };
    case 'servo':
      return { id: id(), kind: 'servo', mechanismId: str(raw.mechanismId), position: num(raw.position, 0.5, 0, 1) };
    case 'motor':
      return {
        id: id(),
        kind: 'motor',
        mechanismId: str(raw.mechanismId),
        power: num(raw.power, 0, -1, 1),
        ms: num(raw.ms, 0, 0, 30000),
        ...(raw.background === true ? { background: true } : {}),
      };
    case 'command':
      if (typeof raw.name !== 'string') return null;
      return {
        id: id(),
        kind: 'command',
        name: raw.name,
        ...(raw.ms !== undefined ? { ms: num(raw.ms, 0, 0, 30000) } : {}),
        ...(raw.background === true ? { background: true } : {}),
      };
    case 'turn':
      return { id: id(), kind: 'turn', heading: num(raw.heading, 0, -360, 360), power: num(raw.power, 0.5, 0.05, 1) };
    default:
      return null;
  }
}

function sanitizeMarker(raw: unknown, seen: Set<string>): Marker | null {
  if (!isObj(raw)) return null;
  const action = sanitizeMarkerAction(raw.action);
  if (!action) return null;
  return { id: freshId(raw.id, 'mk', seen), t: num(raw.t, 0.5, 0, 1), action };
}

function sanitizeAnchor(raw: unknown): Anchor | undefined {
  if (!isObj(raw) || !WALLS.includes(raw.wall as WallSide) || !FACES.includes(raw.face as RobotFace)) return undefined;
  return {
    wall: raw.wall as WallSide,
    face: raw.face as RobotFace,
    alignHeading: bool(raw.alignHeading, true),
    power: num(raw.power, 0.3, 0.05, 1),
  };
}

export function sanitizeWaypoint(raw: unknown, seen = new Set<string>()): Waypoint | null {
  if (!isObj(raw) || typeof raw.x !== 'number' || typeof raw.y !== 'number' || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) return null;
  const wp: Waypoint = {
    id: freshId(raw.id, 'wp', seen),
    x: num(raw.x, 0, -FIELD, FIELD),
    y: num(raw.y, 0, -FIELD, FIELD),
    heading: num(raw.heading, 90, -360, 360),
    power: num(raw.power, 0.6, 0, 1),
    reversed: bool(raw.reversed, false),
    timeoutMs: num(raw.timeoutMs, 0, 0, 30000),
    markers: list(raw.markers)
      .map((m) => sanitizeMarker(m, seen))
      .filter((m): m is Marker => !!m),
    actions: list(raw.actions)
      .map((a) => sanitizeAction(a, seen))
      .filter((a): a is Action => !!a),
  };
  const anchor = sanitizeAnchor(raw.anchor);
  if (anchor) wp.anchor = anchor;
  if (typeof raw.precision === 'boolean') wp.precision = raw.precision;
  return wp;
}

export function sanitizeAuto(raw: unknown, seen = new Set<string>()): Auto | null {
  if (!isObj(raw)) return null;
  const waypoints = list(raw.waypoints)
    .map((w) => sanitizeWaypoint(w, seen))
    .filter((w): w is Waypoint => !!w);
  if (waypoints.length === 0) return null;
  return { id: freshId(raw.id, 'auto', seen), name: str(raw.name, 'Auto').slice(0, 80), waypoints };
}

export function sanitizeAutos(raw: unknown): Auto[] {
  const seen = new Set<string>();
  return list(raw)
    .map((a) => sanitizeAuto(a, seen))
    .filter((a): a is Auto => !!a);
}

function sameShape<T extends object>(base: T, raw: unknown): T {
  if (!isObj(raw)) return base;
  const out = { ...base } as Record<string, unknown>;
  for (const [k, def] of Object.entries(base)) {
    const v = raw[k];
    if (typeof def === 'number') out[k] = num(v, def);
    else if (typeof def === 'string') out[k] = str(v, def);
    else if (typeof def === 'boolean') out[k] = bool(v, def);
  }
  return out as T;
}

function sanitizeMechanism(raw: unknown, seen: Set<string>): Mechanism | null {
  if (!isObj(raw)) return null;
  return {
    id: freshId(raw.id, 'mech', seen),
    label: str(raw.label),
    kind: oneOf(raw.kind, ['servo', 'motor', 'crservo'] as const, 'servo'),
    javaExpr: str(raw.javaExpr),
    hardwareName: str(raw.hardwareName),
  };
}

function sanitizeWallSample(raw: unknown): WallSample | null {
  if (!isObj(raw) || !WALLS.includes(raw.wall as WallSide)) return null;
  const n = (v: unknown) => (typeof v === 'number' ? v : NaN);
  const w: WallSample = {
    wall: raw.wall as WallSide,
    corrIn: n(raw.corrIn),
    corrDeg: n(raw.corrDeg),
    forward: n(raw.forward),
    strafe: n(raw.strafe),
    forwardAbs: n(raw.forwardAbs),
    strafeAbs: n(raw.strafeAbs),
    turns: num(raw.turns, 0, 0),
    seconds: num(raw.seconds, 0, 0),
    headingTurns: num(raw.headingTurns, 0, 0),
    headingSeconds: num(raw.headingSeconds, 0, 0),
  };
  return [w.forward, w.strafe, w.forwardAbs, w.strafeAbs].every(Number.isFinite) ? w : null;
}

function sanitizeRunRecord(raw: unknown): RunRecord | null {
  if (!isObj(raw) || typeof raw.id !== 'string') return null;
  const c = isObj(raw.constants) ? raw.constants : null;
  const d = c && num(c.wheelDiameterIn, NaN);
  const sm = c && num(c.strafeMultiplier, NaN);
  return {
    id: raw.id,
    name: str(raw.name, 'run'),
    date: num(raw.date, 0),
    constants: d && sm && Number.isFinite(d) && Number.isFinite(sm) ? { wheelDiameterIn: d, strafeMultiplier: sm } : null,
    drivetrain: oneOf(raw.drivetrain, ['mecanum', 'tank'] as const, 'mecanum'),
    walls: list(raw.walls)
      .map(sanitizeWallSample)
      .filter((w): w is WallSample => !!w),
  };
}

export function sanitizeConfig(raw: unknown): HardwareConfig {
  const base = defaultConfig();
  if (!isObj(raw)) return base;
  const c = sameShape(base, raw);
  const seen = new Set<string>();
  const constants: DriveConstants = sameShape(base.constants, raw.constants);
  const profiles: HardwareConfig['profiles'] = {};
  const rawProfiles = isObj(raw.profiles) ? raw.profiles : {};
  for (const p of PROFILES) {
    const v = rawProfiles[p];
    if (!isObj(v)) continue;
    const vals = Object.fromEntries(CALIB_KEYS.filter((k) => typeof v[k] === 'number' && Number.isFinite(v[k])).map((k) => [k, v[k]]));
    profiles[p] = { ...Object.fromEntries(CALIB_KEYS.map((k) => [k, constants[k]])), ...vals } as CalibValues;
  }
  const runHistory: HardwareConfig['runHistory'] = {};
  const rawRuns = isObj(raw.runHistory) ? raw.runHistory : {};
  for (const p of PROFILES) {
    const runs = list(rawRuns[p])
      .map(sanitizeRunRecord)
      .filter((r): r is RunRecord => !!r);
    if (runs.length) runHistory[p] = runs;
  }
  const LOGO = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'FORWARD', 'BACKWARD'] as const;
  return {
    ...c,
    drivetrain: oneOf(raw.drivetrain, ['mecanum', 'tank'] as const, base.drivetrain),
    tankMotorCount: oneOf(raw.tankMotorCount, [2, 4] as const, base.tankMotorCount),
    output: oneOf(raw.output, ['snippet', 'opmode'] as const, base.output),
    hubLogo: oneOf(raw.hubLogo, LOGO, base.hubLogo),
    hubUsb: oneOf(raw.hubUsb, LOGO, base.hubUsb),
    activeProfile: oneOf(raw.activeProfile, PROFILES, base.activeProfile),
    motors: sameShape(base.motors, raw.motors),
    hardwareNames: sameShape(base.hardwareNames, raw.hardwareNames),
    reversedMotors: sameShape(base.reversedMotors, raw.reversedMotors),
    mechanisms: list(raw.mechanisms)
      .map((m) => sanitizeMechanism(m, seen))
      .filter((m): m is Mechanism => !!m),
    commands: [...new Set(list(raw.commands).filter((x): x is string => typeof x === 'string'))],
    constants,
    profiles,
    runHistory,
  };
}

export function sanitizeView(raw: unknown): ViewPrefs {
  const base = defaultView();
  if (!isObj(raw)) return base;
  const v = sameShape(base, raw);
  return {
    ...v,
    units: oneOf(raw.units, ['in', 'cm'] as const, base.units),
    convention: oneOf(raw.convention, ['ftc', 'corner'] as const, base.convention),
    rotation: oneOf(raw.rotation, [0, 90, 180, 270] as const, base.rotation),
    mirrorMode: oneOf(raw.mirrorMode, ['flipX', 'flipY', 'rotate180'] as const, base.mirrorMode),
    language: oneOf(raw.language, ['en', 'tr'] as const, base.language),
    robotLengthIn: num(raw.robotLengthIn, base.robotLengthIn, 4, 18),
    robotWidthIn: num(raw.robotWidthIn, base.robotWidthIn, 4, 18),
    fieldOpacity: num(raw.fieldOpacity, base.fieldOpacity, 0, 1),
    fieldImageUrl: v.fieldImageUrl.startsWith('blob:') ? base.fieldImageUrl : v.fieldImageUrl.replace(/^\/fields\//, 'fields/'),
    flatFaces: Array.isArray(raw.flatFaces) ? [...new Set(raw.flatFaces.filter((f): f is RobotFace => FACES.includes(f as RobotFace)))] : base.flatFaces,
    guideDone: list(raw.guideDone).filter((g): g is string => typeof g === 'string'),
  };
}
