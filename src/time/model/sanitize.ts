import { defaultAuto, defaultCalibration, defaultHardware, defaultView, newId } from './defaults';
import type {
  Auto,
  Calibration,
  HardwareConfig,
  LogoDirection,
  Mechanism,
  MotorKey,
  Pose,
  RobotFace,
  Step,
  ViewPrefs,
} from './types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}
function str(v: unknown, fallback: string, maxLen = 200): string {
  return typeof v === 'string' ? v.slice(0, maxLen) : fallback;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}
function oneOf<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return options.includes(v as T) ? (v as T) : fallback;
}

const FACES: readonly RobotFace[] = ['front', 'back', 'left', 'right'];
const LOGO: readonly LogoDirection[] = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'FORWARD', 'BACKWARD'];

function pose(v: unknown, fallback: Pose): Pose {
  if (!isObj(v)) return fallback;
  return { x: num(v.x, fallback.x, -72, 72), y: num(v.y, fallback.y, -72, 72), heading: num(v.heading, fallback.heading, -360, 360) };
}

export function sanitizeStep(v: unknown): Step | null {
  if (!isObj(v)) return null;
  const id = str(v.id, '') || newId('st');
  const ms = (x: unknown, d: number) => Math.round(num(x, d, 0, 30000));
  const power = (x: unknown, d: number) => num(x, d, 0, 1);
  switch (v.kind) {
    case 'drive':
      return { id, kind: 'drive', dirDeg: num(v.dirDeg, 0, -180, 180), power: power(v.power, 0.5), ms: ms(v.ms, 500) };
    case 'turn':
      return { id, kind: 'turn', heading: num(v.heading, 0, -360, 360), power: power(v.power, 0.5) };
    case 'wall':
      return {
        id,
        kind: 'wall',
        face: oneOf(v.face, FACES, 'back'),
        power: power(v.power, 0.3),
        ms: ms(v.ms, 900),
        alignHeading: bool(v.alignHeading, true),
      };
    case 'wait':
      return { id, kind: 'wait', ms: ms(v.ms, 500) };
    case 'servo':
      return { id, kind: 'servo', mechanismId: str(v.mechanismId, ''), position: num(v.position, 0.5, 0, 1) };
    case 'motor':
      return { id, kind: 'motor', mechanismId: str(v.mechanismId, ''), power: num(v.power, 0.5, -1, 1), ms: ms(v.ms, 0), background: bool(v.background, false) };
    case 'command':
      return { id, kind: 'command', name: str(v.name, '', 60), ms: ms(v.ms, 0), background: bool(v.background, false), stopCommand: str(v.stopCommand, '', 60) };
    default:
      return null;
  }
}

export function sanitizeAuto(v: unknown): Auto | null {
  if (!isObj(v)) return null;
  const d = defaultAuto();
  const steps = Array.isArray(v.steps) ? v.steps.map(sanitizeStep).filter((s): s is Step => s !== null) : [];
  return { id: str(v.id, '') || newId('auto'), name: str(v.name, d.name, 60) || d.name, start: pose(v.start, d.start), steps };
}

export function sanitizeCalibration(v: unknown): Calibration {
  const d = defaultCalibration();
  if (!isObj(v)) return d;
  return {
    measured: bool(v.measured, d.measured),
    calPower: num(v.calPower, d.calPower, 0.1, 1),
    forwardInPerSec: num(v.forwardInPerSec, d.forwardInPerSec, 1, 300),
    strafeInPerSec: num(v.strafeInPerSec, d.strafeInPerSec, 1, 300),
    forwardExtraMs: num(v.forwardExtraMs, d.forwardExtraMs, -1000, 1000),
    strafeExtraMs: num(v.strafeExtraMs, d.strafeExtraMs, -1000, 1000),
    minPower: num(v.minPower, d.minPower, 0, 0.3),
    turnDegPerSec: num(v.turnDegPerSec, d.turnDegPerSec, 1, 2000),
    refVoltage: num(v.refVoltage, d.refVoltage, 9, 15),
    rampMs: num(v.rampMs, d.rampMs, 0, 1000),
    backOffMs: num(v.backOffMs, d.backOffMs, 0, 2000),
    backOffPower: num(v.backOffPower, d.backOffPower, 0, 1),
    squareMs: num(v.squareMs, d.squareMs, 0, 3000),
    drivePct: num(v.drivePct, d.drivePct, 0, 1),
    strafePct: num(v.strafePct, d.strafePct, 0, 1),
    turnSigmaDeg: num(v.turnSigmaDeg, d.turnSigmaDeg, 0, 45),
    wallSigmaIn: num(v.wallSigmaIn, d.wallSigmaIn, 0, 12),
  };
}

const JAVA_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function mechanism(v: unknown): Mechanism | null {
  if (!isObj(v)) return null;
  const javaName = str(v.javaName, '', 60);
  return {
    id: str(v.id, '') || newId('mech'),
    label: str(v.label, javaName, 60),
    kind: oneOf(v.kind, ['servo', 'motor', 'crservo'] as const, 'servo'),
    javaName: JAVA_IDENT.test(javaName) ? javaName : 'mechanism',
    hardwareName: str(v.hardwareName, '', 60),
  };
}

function savedCommands(v: Record<string, unknown>, d: HardwareConfig): string[] {
  const saved = Array.isArray(v.commands) ? v.commands.filter((c): c is string => typeof c === 'string').map((c) => c.slice(0, 60)) : [];
  if (typeof v.commandSetup === 'string') return saved;
  return [...new Set([...d.commands, ...saved])];
}

export function sanitizeHardware(v: unknown): HardwareConfig {
  const d = defaultHardware();
  if (!isObj(v)) return d;
  const m = isObj(v.motors) ? v.motors : {};
  const r = isObj(v.reversed) ? v.reversed : {};
  const keys: MotorKey[] = ['frontLeft', 'frontRight', 'backLeft', 'backRight'];
  const motors = { ...d.motors };
  const reversed = { ...d.reversed };
  for (const k of keys) {
    motors[k] = str(m[k], d.motors[k], 60) || d.motors[k];
    reversed[k] = bool(r[k], d.reversed[k]);
  }
  return {
    motors,
    reversed,
    imu: str(v.imu, d.imu, 60) || d.imu,
    hubLogo: oneOf(v.hubLogo, LOGO, d.hubLogo),
    hubUsb: oneOf(v.hubUsb, LOGO, d.hubUsb),
    mechanisms: Array.isArray(v.mechanisms) ? v.mechanisms.map(mechanism).filter((x): x is Mechanism => x !== null) : [],
    commands: savedCommands(v, d),
    commandSetup: typeof v.commandSetup === 'string' ? v.commandSetup.slice(0, 300) : d.commandSetup,
    packageName: str(v.packageName, d.packageName, 200) || d.packageName,
    runnerPackage: str(v.runnerPackage, d.runnerPackage, 200) || d.runnerPackage,
    opModeGroup: str(v.opModeGroup, d.opModeGroup, 60),
    headingKp: num(v.headingKp, d.headingKp, 0, 1),
    headingKi: num(v.headingKi, d.headingKi, 0, 1),
    turnKp: num(v.turnKp, d.turnKp, 0, 1),
    turnMinPower: num(v.turnMinPower, d.turnMinPower, 0, 1),
    turnTolDeg: num(v.turnTolDeg, d.turnTolDeg, 0.1, 20),
    turnTimeoutMs: num(v.turnTimeoutMs, d.turnTimeoutMs, 200, 10000),
  };
}

export function sanitizeView(v: unknown, lang: 'en' | 'tr' = 'en'): ViewPrefs {
  const d = defaultView(lang);
  if (!isObj(v)) return d;
  return {
    units: oneOf(v.units, ['in', 'cm'] as const, d.units),
    rotation: ([0, 90, 180, 270] as const).find((r) => r === v.rotation) ?? 0,
    snapIn: num(v.snapIn, d.snapIn, 0, 12),
    mirrorMode: oneOf(v.mirrorMode, ['rotate180', 'flipX'] as const, d.mirrorMode),
    robotLengthIn: num(v.robotLengthIn, d.robotLengthIn, 4, 40),
    robotWidthIn: num(v.robotWidthIn, d.robotWidthIn, 4, 40),
    flatFaces: Array.isArray(v.flatFaces) ? FACES.filter((f) => (v.flatFaces as unknown[]).includes(f)) : d.flatFaces,
    fieldImageUrl: str(v.fieldImageUrl, d.fieldImageUrl, 500).replace(/^\/fields\//, 'fields/'),
    fieldOpacity: num(v.fieldOpacity, d.fieldOpacity, 0, 1),
    showRuleZones: bool(v.showRuleZones, d.showRuleZones),
    showError: bool(v.showError, d.showError),
    defaultPower: num(v.defaultPower, d.defaultPower, 0.1, 1),
    language: oneOf(v.language, ['en', 'tr'] as const, d.language),
  };
}

export interface SavedData {
  autos: Auto[];
  activeId: string;
  calibration: Calibration;
  hw: HardwareConfig;
  view: ViewPrefs;
}

export function sanitizeSaved(v: unknown, lang: 'en' | 'tr' = 'en'): SavedData {
  const o = isObj(v) ? v : {};
  let autos = Array.isArray(o.autos) ? o.autos.map(sanitizeAuto).filter((a): a is Auto => a !== null) : [];
  if (!autos.length) autos = [defaultAuto()];
  const seen = new Set<string>();
  autos = autos.map((a) => {
    const steps = a.steps.map((s) => {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        return s;
      }
      return { ...s, id: newId('st') };
    });
    if (seen.has(a.id)) return { ...a, id: newId('auto'), steps };
    seen.add(a.id);
    return { ...a, steps };
  });
  const activeId = typeof o.activeId === 'string' && autos.some((a) => a.id === o.activeId) ? o.activeId : autos[0].id;
  return {
    autos,
    activeId,
    calibration: sanitizeCalibration(o.calibration),
    hw: sanitizeHardware(o.hw),
    view: sanitizeView(o.view, lang),
  };
}
