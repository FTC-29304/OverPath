import { defaultLang } from '../i18n/translate';
import type { Action, ActionKind, Auto, HardwareConfig, ViewPrefs, Waypoint } from './types';

let counter = 0;
export function uid(prefix = 'id'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultConfig(): HardwareConfig {
  return {
    drivetrain: 'mecanum',
    tankMotorCount: 4,
    motors: {
      leftFront: 'frontLeftMotor',
      rightFront: 'frontRightMotor',
      leftBack: 'backLeftMotor',
      rightBack: 'backRightMotor',
    },
    imu: 'imu',
    mechanisms: [
      { id: 'mech_claw', label: 'Claw', kind: 'servo', javaExpr: 'clawServo', hardwareName: 'clawServo' },
      { id: 'mech_intake', label: 'Intake', kind: 'motor', javaExpr: 'intakeMotor', hardwareName: 'intakeMotor' },
    ],
    commands: ['score'],
    runnerVar: 'runner',
    packageName: 'org.firstinspires.ftc.teamcode.autos',
    runnerPackage: 'org.firstinspires.ftc.teamcode.overpath',
    opModeGroup: 'OverPath',
    output: 'snippet',
    emitHardwareMapInit: true,
    hardwareNames: {
      leftFront: 'frontLeftMotor',
      rightFront: 'frontRightMotor',
      leftBack: 'backLeftMotor',
      rightBack: 'backRightMotor',
      imu: 'imu',
    },
    reversedMotors: { leftFront: true, rightFront: false, leftBack: true, rightBack: false },
    hubLogo: 'UP',
    hubUsb: 'FORWARD',
    activeProfile: 'home',
    profiles: {},
    runHistory: {},
    motorModel: 'gobilda-312',
    wheelModel: 'gobilda-mecanum-96',
    constants: {
      ticksPerRev: 537.7,
      gearRatio: 1,
      wheelDiameterIn: 3.78,
      strafeMultiplier: 1.1,
      headingKp: 0.02,
      turnKp: 0.015,
      turnTolDeg: 1.5,
      minPower: 0.15,
      turnMinPower: 0.12,
      rampIn: 6,
      turnPower: 0.5,
      maxSpeedInPerSec: 45,
      turnRateDegPerSec: 300,
      maxPowerRatePerS: 2,
      maxPowerDropPerS: 4,
      brakeLinear: 0.08,
      brakeQuadratic: 0,
      turnRadiusIn: 12,
      alongPct: 0.02,
      strafePct: 0.06,
      turnSigmaDeg: 1.0,
      headingDriftDegPerS: 0.05,
      squarePosSigmaIn: 0.25,
      squareHeadingSigmaDeg: 0.5,
    },
  };
}

export function defaultView(): ViewPrefs {
  return {
    units: 'in',
    convention: 'ftc',
    rotation: 0,
    snapIn: 3,
    headingSnapDeg: 15,
    mirrorMode: 'rotate180',
    robotLengthIn: 18,
    robotWidthIn: 18,
    fieldImageUrl: 'fields/biobuzz.png',
    fieldOpacity: 1,
    fieldImageInset: 0,
    showRuleZones: true,
    language: defaultLang(),
    guideSeen: false,
    guideDone: [],
    runnerDownloaded: '',
    flatFaces: ['front', 'back'],
    showUncertainty: true,
  };
}

export function makeWaypoint(x: number, y: number, heading: number, power = 0.6): Waypoint {
  return { id: uid('wp'), x, y, heading, power, reversed: false, timeoutMs: 0, markers: [], actions: [] };
}

export function defaultAuto(name = 'Auto 1'): Auto {
  return {
    id: uid('auto'),
    name,
    waypoints: [makeWaypoint(-36, -63, 90), makeWaypoint(-36, -36, 90)],
  };
}

export function makeAction(kind: ActionKind, config: HardwareConfig): Action {
  const servo = config.mechanisms.find((m) => m.kind === 'servo');
  const motor = config.mechanisms.find((m) => m.kind !== 'servo');
  switch (kind) {
    case 'wait':
      return { id: uid('act'), kind, ms: 500 };
    case 'servo':
      return { id: uid('act'), kind, mechanismId: servo?.id ?? '', position: 0.5 };
    case 'motor':
      return { id: uid('act'), kind, mechanismId: motor?.id ?? '', power: 1, ms: 0, background: false };
    case 'command':
      return { id: uid('act'), kind, name: config.commands[0] ?? 'myCommand', ms: 0, background: false };
    case 'turn':
      return { id: uid('act'), kind, heading: 0, power: 0.4 };
  }
}
