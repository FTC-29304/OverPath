import type { Auto, Calibration, HardwareConfig, Step, ViewPrefs } from './types';

let counter = 0;
export function newId(prefix = 'id'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultCalibration(): Calibration {
  return {
    measured: false,
    calPower: 0.5,
    forwardInPerSec: 36,
    strafeInPerSec: 27,
    forwardExtraMs: 60,
    strafeExtraMs: 40,
    minPower: 0.06,
    turnDegPerSec: 170,
    refVoltage: 12.8,
    rampMs: 150,
    backOffMs: 150,
    backOffPower: 0.3,
    squareMs: 400,
    drivePct: 0.06,
    strafePct: 0.1,
    turnSigmaDeg: 1.5,
    wallSigmaIn: 0.3,
  };
}

export const ROBOT_COMMANDS = [
  'shooter on',
  'shoot',
  'stop shooting',
  'shooter off',
  'intake in',
  'intake out',
  'intake off',
  'ramp open',
  'ramp close',
];
export const ROBOT_COMMAND_SETUP = 'org.firstinspires.ftc.teamcode.AutoMechanisms.register(this, runner);';

export function defaultHardware(): HardwareConfig {
  return {
    motors: {
      frontLeft: 'front_left_drive',
      frontRight: 'front_right_drive',
      backLeft: 'back_left_drive',
      backRight: 'back_right_drive',
    },
    reversed: { frontLeft: true, frontRight: false, backLeft: true, backRight: false },
    imu: 'imu',
    hubLogo: 'DOWN',
    hubUsb: 'BACKWARD',
    mechanisms: [],
    commands: [...ROBOT_COMMANDS],
    commandSetup: ROBOT_COMMAND_SETUP,
    packageName: 'org.firstinspires.ftc.teamcode.autos',
    runnerPackage: 'org.firstinspires.ftc.teamcode.overtime',
    opModeGroup: 'OverTime',
    headingKp: 0.02,
    headingKi: 0.02,
    turnKp: 0.012,
    turnMinPower: 0.12,
    turnTolDeg: 1.5,
    turnTimeoutMs: 2500,
  };
}

export function defaultView(language: 'en' | 'tr' = 'en'): ViewPrefs {
  return {
    units: 'in',
    rotation: 0,
    snapIn: 1,
    mirrorMode: 'rotate180',
    robotLengthIn: 18,
    robotWidthIn: 18,
    flatFaces: ['front', 'back'],
    fieldImageUrl: 'fields/biobuzz.png',
    fieldOpacity: 1,
    showRuleZones: true,
    showError: true,
    defaultPower: 0.5,
    language,
  };
}

export function defaultAuto(name = 'RedAuto'): Auto {
  return {
    id: newId('auto'),
    name,
    start: { x: 63, y: 0, heading: 180 },
    steps: [{ id: newId('st'), kind: 'drive', dirDeg: 0, power: 0.5, ms: 600 }],
  };
}

export function blankStep(kind: Step['kind'], defaultPower: number, heading = 0): Step {
  const id = newId('st');
  switch (kind) {
    case 'drive':
      return { id, kind, dirDeg: 0, power: defaultPower, ms: 500 };
    case 'turn':
      return { id, kind, heading, power: 0.5 };
    case 'wall':
      return { id, kind, face: 'back', power: 0.3, ms: 900, alignHeading: true };
    case 'wait':
      return { id, kind, ms: 500 };
    case 'servo':
      return { id, kind, mechanismId: '', position: 0.5 };
    case 'motor':
      return { id, kind, mechanismId: '', power: 0.5, ms: 500 };
    case 'command':
      return { id, kind, name: '', ms: 0 };
  }
}
