import type { RunRecord } from '../logs/learn';

export type Drivetrain = 'mecanum' | 'tank';

export type MechanismKind = 'servo' | 'motor' | 'crservo';

export interface Mechanism {
  id: string;
  label: string;
  kind: MechanismKind;
  javaExpr: string;
  hardwareName: string;
}

export type Action =
  | { id: string; kind: 'wait'; ms: number }
  | { id: string; kind: 'servo'; mechanismId: string; position: number }
  | { id: string; kind: 'motor'; mechanismId: string; power: number; ms: number; background?: boolean }
  | { id: string; kind: 'command'; name: string; ms?: number; background?: boolean }
  | { id: string; kind: 'turn'; heading: number; power: number };

export type ActionKind = Action['kind'];

export type MarkerAction =
  | { kind: 'servo'; mechanismId: string; position: number }
  | { kind: 'motor'; mechanismId: string; power: number }
  | { kind: 'command'; name: string };

export interface Marker {
  id: string;
  t: number;
  action: MarkerAction;
}

export type WallSide = 'left' | 'right' | 'audience' | 'rear';
export type RobotFace = 'front' | 'back' | 'left' | 'right';

export interface Anchor {
  wall: WallSide;
  face: RobotFace;
  alignHeading: boolean;
  power: number;
}

export interface Waypoint {
  id: string;
  x: number;
  y: number;
  heading: number;
  power: number;
  reversed: boolean;
  timeoutMs: number;
  markers: Marker[];
  actions: Action[];
  anchor?: Anchor;
  precision?: boolean;
}

export interface Auto {
  id: string;
  name: string;
  waypoints: Waypoint[];
}

export interface DriveMotors {
  leftFront: string;
  rightFront: string;
  leftBack: string;
  rightBack: string;
}

export type MotorKey = keyof DriveMotors;

export interface DriveConstants {
  ticksPerRev: number;
  gearRatio: number;
  wheelDiameterIn: number;
  strafeMultiplier: number;
  headingKp: number;
  turnKp: number;
  turnTolDeg: number;
  minPower: number;
  turnMinPower: number;
  rampIn: number;
  turnPower: number;
  maxSpeedInPerSec: number;
  turnRateDegPerSec: number;
  maxPowerRatePerS: number;
  maxPowerDropPerS: number;
  brakeLinear: number;
  brakeQuadratic: number;
  turnRadiusIn: number;
  alongPct: number;
  strafePct: number;
  turnSigmaDeg: number;
  headingDriftDegPerS: number;
  squarePosSigmaIn: number;
  squareHeadingSigmaDeg: number;
}

export type ProfileName = 'home' | 'competition';
export type CalibValues = Pick<
  DriveConstants,
  'wheelDiameterIn' | 'strafeMultiplier' | 'alongPct' | 'strafePct' | 'turnSigmaDeg' | 'maxPowerRatePerS' | 'maxPowerDropPerS' | 'brakeLinear' | 'brakeQuadratic'
>;
export const CALIB_KEYS: (keyof CalibValues)[] = [
  'wheelDiameterIn',
  'strafeMultiplier',
  'alongPct',
  'strafePct',
  'turnSigmaDeg',
  'maxPowerRatePerS',
  'maxPowerDropPerS',
  'brakeLinear',
  'brakeQuadratic',
];

export type LogoDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'FORWARD' | 'BACKWARD';

export interface HardwareConfig {
  drivetrain: Drivetrain;
  tankMotorCount: 2 | 4;
  motors: DriveMotors;
  imu: string;
  mechanisms: Mechanism[];
  commands: string[];
  runnerVar: string;
  packageName: string;
  runnerPackage: string;
  opModeGroup: string;
  output: 'snippet' | 'opmode';
  emitHardwareMapInit: boolean;
  hardwareNames: DriveMotors & { imu: string };
  reversedMotors: Record<MotorKey, boolean>;
  hubLogo: LogoDirection;
  hubUsb: LogoDirection;
  motorModel: string;
  wheelModel: string;
  constants: DriveConstants;
  activeProfile: ProfileName;
  profiles: Partial<Record<ProfileName, CalibValues>>;
  runHistory: Partial<Record<ProfileName, RunRecord[]>>;
}

export type MirrorMode = 'flipX' | 'flipY' | 'rotate180';

export interface ViewPrefs {
  units: 'in' | 'cm';
  convention: 'ftc' | 'corner';
  rotation: 0 | 90 | 180 | 270;
  snapIn: number;
  headingSnapDeg: number;
  mirrorMode: MirrorMode;
  robotLengthIn: number;
  robotWidthIn: number;
  fieldImageUrl: string;
  fieldOpacity: number;
  fieldImageInset: number;
  showRuleZones: boolean;
  language: 'en' | 'tr';
  flatFaces: RobotFace[];
  showUncertainty: boolean;
  guideSeen: boolean;
  guideDone: string[];
  runnerDownloaded: string;
}

export interface Pose {
  x: number;
  y: number;
  heading: number;
}

export interface CompiledMarker {
  t: number;
  action: MarkerAction;
}

export type Step = (
  | { kind: 'turnTo'; heading: number; power: number }
  | { kind: 'move'; forward: number; strafeRight: number; power: number; markers: CompiledMarker[]; reversed: boolean }
  | { kind: 'square'; wall: WallSide; face: RobotFace; align: boolean; power: number; contact: Pose }
  | { kind: 'wait'; ms: number }
  | { kind: 'servo'; mechanismId: string; position: number }
  | { kind: 'motor'; mechanismId: string; power: number; ms: number; background: boolean }
  | { kind: 'command'; name: string; ms: number; background: boolean }
) & {
  wp: number;
  timeoutMs: number;
  from: Pose;
  to: Pose;
};

export type StepKind = Step['kind'];
