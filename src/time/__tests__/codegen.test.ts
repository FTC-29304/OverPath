import { describe, expect, it } from 'vitest';
import { className, dbl, generateAuto, generateCalibration, javaString, runnerFile, RUNNER_VERSION } from '../codegen/java';
import { defaultCalibration, defaultHardware } from '../model/defaults';
import type { Auto, HardwareConfig } from '../model/types';

const hw: HardwareConfig = {
  ...defaultHardware(),
  mechanisms: [
    { id: 'm1', label: 'Claw', kind: 'servo', javaName: 'clawServo', hardwareName: 'claw' },
    { id: 'm2', label: 'Intake', kind: 'crservo', javaName: 'intake', hardwareName: 'intake' },
    { id: 'm3', label: 'Unused', kind: 'motor', javaName: 'liftMotor', hardwareName: 'lift' },
  ],
  commands: ['score'],
  commandSetup: '',
};
const cal = { ...defaultCalibration(), measured: true, refVoltage: 12.6 };
const auto: Auto = {
  id: 'a',
  name: 'Red Left 1',
  start: { x: 63, y: -12, heading: 180 },
  steps: [
    { id: '1', kind: 'drive', dirDeg: 0, power: 0.5, ms: 600 },
    { id: '2', kind: 'turn', heading: 90, power: 0.5 },
    { id: '3', kind: 'wall', face: 'back', power: 0.3, ms: 1200, alignHeading: true },
    { id: '4', kind: 'servo', mechanismId: 'm1', position: 0.65 },
    { id: '5', kind: 'motor', mechanismId: 'm2', power: -1, ms: 800, background: false },
    { id: '6', kind: 'command', name: 'score', ms: 300, background: false, stopCommand: '' },
    { id: '7', kind: 'servo', mechanismId: '', position: 0.2 },
    { id: '8', kind: 'drive', dirDeg: -135, power: 0.4, ms: 450 },
    { id: '9', kind: 'wait', ms: 250 },
  ],
};

describe('codegen', () => {
  it('generates the auto', () => {
    const g = generateAuto(auto, hw, cal);
    expect(g.fileName).toBe('RedLeft1.java');
    expect(g.code).toMatchSnapshot();
  });

  it('writes one runner call per step, in order', () => {
    const { code } = generateAuto(auto, hw, cal);
    const calls = code.split('\n').filter((l) => /^\s+runner\.(drive|turnTo|pushWall|servo|motor|command|waitMs)\(/.test(l));
    expect(calls.map((l) => l.trim().slice(0, 18))).toEqual([
      'runner.drive(0.0, ',
      'runner.turnTo(90.0',
      'runner.pushWall(Ov',
      'runner.servo(clawS',
      'runner.motor(intak',
      'runner.command("sc',
      'runner.drive(-135.',
      'runner.waitMs(250)',
    ]);
    expect(code).toContain('runner.begin(180.0);');
    expect(code).toContain('constants.refVoltage = 12.6;');
    expect(code).toContain('runner.registerCommand("score", () -> {');
    expect(code).toContain('CRServo intake = hardwareMap.get(CRServo.class, "intake");');
    expect(code).not.toContain('liftMotor');
    expect(code).toContain('frontLeftMotor.setDirection(DcMotorSimple.Direction.REVERSE);');
  });

  it('with a command setup line: calls it, writes no TODO stubs', () => {
    const { code } = generateAuto(auto, defaultHardware(), cal);
    expect(code).toContain('        org.firstinspires.ftc.teamcode.AutoMechanisms.register(this, runner);');
    expect(code).not.toContain('registerCommand');
    expect(code).not.toContain('TODO');
    expect(code.indexOf('AutoMechanisms.register')).toBeGreaterThan(code.indexOf('OverTime runner = new OverTime'));
    expect(code.indexOf('AutoMechanisms.register')).toBeLessThan(code.indexOf('waitForStart();'));
  });

  it('says when the calibration is not measured', () => {
    expect(generateAuto(auto, hw, { ...cal, measured: false }).code).toContain('Calibration not measured yet');
    expect(generateAuto(auto, hw, cal).code).not.toContain('Calibration not measured yet');
  });

  it('makes valid Java names and literals', () => {
    expect(className('Red Auto 2')).toBe('RedAuto2');
    expect(className('2 blue')).toBe('Auto2Blue');
    expect(className('!!!')).toBe('OverTimeAuto');
    expect(className('class')).toBe('Class');
    expect(javaString('a"b\\c')).toBe('"a\\"b\\\\c"');
    expect(dbl(180)).toBe('180.0');
    expect(dbl(-0.25)).toBe('-0.25');
    expect(dbl(-0)).toBe('0.0');
  });

  it('calibration OpMode has no battery compensation and no 30 s limit', () => {
    const c = generateCalibration(hw, cal).code;
    expect(c).toContain('constants.refVoltage = 0;');
    expect(c).toContain('constants.autoLimitMs = 0;');
    expect(c).toContain('double power = 0.5;');
    expect(c).toContain('@TeleOp(name = "OverTimeCalibration"');
  });

  it('runner file gets the team package and a version', () => {
    const r = runnerFile({ ...hw, runnerPackage: 'org.firstinspires.ftc.teamcode.lib' });
    expect(r.code.startsWith('package org.firstinspires.ftc.teamcode.lib;')).toBe(true);
    expect(RUNNER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
