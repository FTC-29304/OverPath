import { describe, expect, it } from 'vitest';
import { generateJava } from '../codegen/java';
import { isJavaExpressionPath, isJavaIdentifier, javaString, jDouble, toClassName } from '../codegen/javaIdent';
import { defaultAuto, defaultConfig, makeWaypoint } from '../model/defaults';
import type { Auto, HardwareConfig } from '../model/types';

function sampleAuto(): Auto {
  const start = makeWaypoint(-36, -63, 90);
  start.actions = [{ id: 'a0', kind: 'servo', mechanismId: 'mech_claw', position: 0.1 }];
  const a = makeWaypoint(-36, -36, 90, 0.6);
  a.markers = [{ id: 'm1', t: 0.5, action: { kind: 'command', name: 'intakeOn' } }];
  a.actions = [{ id: 'a1', kind: 'wait', ms: 1000 }];
  const b = makeWaypoint(-12, -36, 45, 0.5);
  b.timeoutMs = 4000;
  b.markers = [{ id: 'm2', t: 0.8, action: { kind: 'servo', mechanismId: 'mech_claw', position: 0.8 } }];
  b.actions = [
    { id: 'a2', kind: 'motor', mechanismId: 'mech_intake', power: -1, ms: 750 },
    { id: 'a3', kind: 'command', name: 'score' },
  ];
  return { id: 'auto', name: 'Blue Left 3+0', waypoints: [start, a, b] };
}

describe('generateJava', () => {
  it('mecanum snippet with the team’s own variable paths', () => {
    const config: HardwareConfig = {
      ...defaultConfig(),
      motors: {
        leftFront: 'driveTrain.frontLeftMotor',
        rightFront: 'driveTrain.frontRightMotor',
        leftBack: 'driveTrain.backLeftMotor',
        rightBack: 'driveTrain.backRightMotor',
      },
      imu: 'robot.imu',
    };
    const r = generateJava(sampleAuto(), config);
    expect(r.errors).toEqual([]);
    expect(r.code).toContain('driveTrain.frontLeftMotor, driveTrain.frontRightMotor, driveTrain.backLeftMotor, driveTrain.backRightMotor, robot.imu,');
    expect(r.code).toContain('.marker(0.5, "intakeOn")');
    expect(r.code).toContain('.timeout(4000)');
    expect(r.code).toMatchSnapshot();
  });

  it('tank full OpMode declares hardware and never strafes', () => {
    const config: HardwareConfig = { ...defaultConfig(), drivetrain: 'tank', tankMotorCount: 2, output: 'opmode' };
    const r = generateJava(sampleAuto(), config);
    expect(r.errors).toEqual([]);
    expect(r.className).toBe('BlueLeft30');
    expect(r.code).toContain('frontLeftMotor, frontRightMotor, null, null, imu,');
    expect(r.code).toContain('DcMotorEx frontLeftMotor = hardwareMap.get(DcMotorEx.class, "frontLeftMotor");');
    expect(r.code).not.toContain('backLeftMotor');
    expect(r.code).not.toMatch(/\.strafe\(|\.driveVector\(/);
    expect(r.code).toContain('public class BlueLeft30 extends LinearOpMode');
    expect(r.code).toMatchSnapshot();
  });

  it('rejects dotted names when it has to declare the variables itself', () => {
    const config: HardwareConfig = {
      ...defaultConfig(),
      output: 'opmode',
      emitHardwareMapInit: true,
      motors: { ...defaultConfig().motors, leftFront: 'driveTrain.frontLeftMotor' },
    };
    const r = generateJava(sampleAuto(), config);
    expect(r.errors.map((e) => e.path)).toContain('motors.leftFront');
  });

  it('rejects reserved words, duplicates and parallel hub axes', () => {
    const base = defaultConfig();
    const config: HardwareConfig = {
      ...base,
      output: 'opmode',
      imu: 'class',
      motors: { ...base.motors, rightBack: 'frontLeftMotor' },
      hubLogo: 'UP',
      hubUsb: 'DOWN',
    };
    const paths = generateJava(sampleAuto(), config).errors.map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(['imu', 'motors.rightBack', 'hubUsb']));
  });

  it('only emits tunables that differ from OverPath defaults', () => {
    const config = defaultConfig();
    expect(generateJava(sampleAuto(), config).code).not.toContain('.headingKp =');
    config.constants.headingKp = 0.03;
    expect(generateJava(sampleAuto(), config).code).toContain('runner.headingKp = 0.03;');
  });

  it('registers every command it uses, even ones not listed in Settings', () => {
    const code = generateJava(sampleAuto(), defaultConfig()).code;
    expect(code).toContain('runner.registerCommand("score"');
    expect(code).toContain('runner.registerCommand("intakeOn"');
  });
});

describe('java identifiers', () => {
  it('validates identifiers and paths', () => {
    expect(isJavaIdentifier('frontLeftMotor')).toBe(true);
    expect(isJavaIdentifier('$x_1')).toBe(true);
    expect(isJavaIdentifier('1abc')).toBe(false);
    expect(isJavaIdentifier('int')).toBe(false);
    expect(isJavaExpressionPath('driveTrain.frontLeftMotor')).toBe(true);
    expect(isJavaExpressionPath('this.robot.lf')).toBe(true);
    expect(isJavaExpressionPath('this')).toBe(false);
    expect(isJavaExpressionPath('a..b')).toBe(false);
    expect(isJavaExpressionPath('a.new')).toBe(false);
    expect(isJavaExpressionPath('motors[0]')).toBe(false);
  });

  it('formats numbers and strings as Java literals', () => {
    expect(jDouble(24)).toBe('24.0');
    expect(jDouble(-12.5)).toBe('-12.5');
    expect(jDouble(1 / 3)).toBe('0.33');
    expect(jDouble(-0.0001)).toBe('0.0');
    expect(javaString('a"b\\c\n')).toBe('"a\\"b\\\\c\\n"');
    expect(javaString('çay')).toBe('"\\u00e7ay"');
    expect(toClassName('blue left 3+0')).toBe('BlueLeft30');
    expect(toClassName('2 piece')).toBe('Auto2Piece');
    expect(toClassName('')).toBe('PathPlannerAuto');
  });
});

describe('snippet output', () => {
  it('doesn\'t call useHardwareMap (a snippet may live outside an OpMode)', () => {
    const snippet = generateJava(defaultAuto(), { ...defaultConfig(), output: 'snippet' }, { lengthIn: 18, widthIn: 18 }).code;
    expect(snippet).not.toMatch(/^\s*runner\.useHardwareMap/m);
    const opmode = generateJava(defaultAuto(), { ...defaultConfig(), output: 'opmode' }, { lengthIn: 18, widthIn: 18 }).code;
    expect(opmode).toMatch(/^\s*runner\.useHardwareMap\(hardwareMap\);/m);
  });
});
