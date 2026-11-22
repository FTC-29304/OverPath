export interface Pose {
  x: number;
  y: number;
  heading: number;
}

export type RobotFace = 'front' | 'back' | 'left' | 'right';
export type WallSide = 'left' | 'right' | 'audience' | 'rear';

export type MechanismKind = 'servo' | 'motor' | 'crservo';

export interface Mechanism {
  id: string;
  label: string;
  kind: MechanismKind;
  javaName: string;
  hardwareName: string;
}

export type Step =
  | { id: string; kind: 'drive'; dirDeg: number; power: number; ms: number }
  | { id: string; kind: 'turn'; heading: number; power: number }
  | { id: string; kind: 'wall'; face: RobotFace; power: number; ms: number; alignHeading: boolean }
  | { id: string; kind: 'wait'; ms: number }
  | { id: string; kind: 'servo'; mechanismId: string; position: number }
  | { id: string; kind: 'motor'; mechanismId: string; power: number; ms: number; background: boolean }
  | { id: string; kind: 'command'; name: string; ms: number; background: boolean; stopCommand: string };

export type StepKind = Step['kind'];

export interface Auto {
  id: string;
  name: string;
  start: Pose;
  steps: Step[];
}

export interface Calibration {
  measured: boolean;
  calPower: number;
  forwardInPerSec: number;
  strafeInPerSec: number;
  forwardExtraMs: number;
  strafeExtraMs: number;
  minPower: number;
  turnDegPerSec: number;
  refVoltage: number;
  rampMs: number;
  backOffMs: number;
  backOffPower: number;
  squareMs: number;
  drivePct: number;
  strafePct: number;
  turnSigmaDeg: number;
  wallSigmaIn: number;
}

export type LogoDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'FORWARD' | 'BACKWARD';

export interface DriveNames {
  frontLeft: string;
  frontRight: string;
  backLeft: string;
  backRight: string;
}
export type MotorKey = keyof DriveNames;

export interface HardwareConfig {
  motors: DriveNames;
  reversed: Record<MotorKey, boolean>;
  imu: string;
  hubLogo: LogoDirection;
  hubUsb: LogoDirection;
  mechanisms: Mechanism[];
  commands: string[];
  commandSetup: string;
  packageName: string;
  runnerPackage: string;
  opModeGroup: string;
  headingKp: number;
  headingKi: number;
  turnKp: number;
  turnMinPower: number;
  turnTolDeg: number;
  turnTimeoutMs: number;
}

export type MirrorMode = 'rotate180' | 'flipX';

export interface ViewPrefs {
  units: 'in' | 'cm';
  rotation: 0 | 90 | 180 | 270;
  snapIn: number;
  mirrorMode: MirrorMode;
  robotLengthIn: number;
  robotWidthIn: number;
  flatFaces: RobotFace[];
  fieldImageUrl: string;
  fieldOpacity: number;
  showRuleZones: boolean;
  showError: boolean;
  defaultPower: number;
  language: 'en' | 'tr';
}

export interface SimStep {
  index: number;
  from: Pose;
  to: Pose;
  contact?: Pose;
  wall?: WallSide;
  shortOfWall?: boolean;
  ms: number;
  startMs: number;
  sx: number;
  sy: number;
  sh: number;
  bgMs?: number;
}

export interface SimResult {
  start: Pose;
  steps: SimStep[];
  end: Pose;
  totalMs: number;
}
