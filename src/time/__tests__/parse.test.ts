import { beforeEach, describe, expect, it } from 'vitest';
import { generateAuto } from '../codegen/java';
import { parseAuto, type ParsedAuto } from '../codegen/parse';
import { guessStopCommand } from '../components/StepList';
import { defaultCalibration, defaultHardware } from '../model/defaults';
import type { Auto, HardwareConfig, Step } from '../model/types';
import { simulate } from '../sim/simulate';
import { defaultView } from '../model/defaults';
import { usePlanner } from '../store/plannerStore';

const hw: HardwareConfig = {
  ...defaultHardware(),
  mechanisms: [
    { id: 'm1', label: 'Claw', kind: 'servo', javaName: 'clawServo', hardwareName: 'claw' },
    { id: 'm2', label: 'Intake', kind: 'crservo', javaName: 'intake', hardwareName: 'intake' },
  ],
};
const cal = { ...defaultCalibration(), measured: true };

const auto: Auto = {
  id: 'a',
  name: 'Red Left',
  start: { x: 63, y: -12, heading: 180 },
  steps: [
    { id: '1', kind: 'command', name: 'intake in', ms: 1500, background: true, stopCommand: 'intake off' },
    { id: '2', kind: 'drive', dirDeg: 0, power: 0.5, ms: 600 },
    { id: '3', kind: 'turn', heading: 90, power: 0.5 },
    { id: '4', kind: 'wall', face: 'back', power: 0.3, ms: 1200, alignHeading: true },
    { id: '5', kind: 'servo', mechanismId: 'm1', position: 0.65 },
    { id: '6', kind: 'motor', mechanismId: 'm2', power: -1, ms: 800, background: false },
    { id: '7', kind: 'motor', mechanismId: 'm2', power: 1, ms: 1200, background: true },
    { id: '8', kind: 'command', name: 'shoot', ms: 0, background: false, stopCommand: '' },
    { id: '9', kind: 'drive', dirDeg: -135, power: 0.4, ms: 450 },
    { id: '10', kind: 'wait', ms: 250 },
  ],
};

const noIds = (steps: Step[]) => steps.map(({ id: _id, ...rest }) => rest);

function parsed(code: string, h: HardwareConfig = hw): ParsedAuto {
  const r = parseAuto(code, h);
  if (!r.ok) throw new Error(r.error);
  return r.auto;
}

describe('parse Java back into steps', () => {
  it('reads generated code back exactly', () => {
    const p = parsed(generateAuto(auto, hw, cal).code);
    expect(p.name).toBe('Red Left');
    expect(p.startHeading).toBe(180);
    expect(noIds(p.steps)).toEqual(noIds(auto.steps));
    expect(p.skipped).toEqual([]);
    expect(p.newMechanisms).toEqual([]);
    expect(p.newCommands).toEqual([]);
  });

  it('reads an auto saved from an earlier version', () => {
    const code = `package org.firstinspires.ftc.teamcode.autos;

import org.firstinspires.ftc.teamcode.overtime.OverTime;

@Autonomous(name = "RedAuto", group = "OverTime")
public class RedAuto extends LinearOpMode {
    @Override
    public void runOpMode() {
        DcMotor frontLeftMotor = hardwareMap.get(DcMotor.class, "front_left_drive");
        DcMotor frontRightMotor = hardwareMap.get(DcMotor.class, "front_right_drive");
        DcMotor backLeftMotor = hardwareMap.get(DcMotor.class, "back_left_drive");
        DcMotor backRightMotor = hardwareMap.get(DcMotor.class, "back_right_drive");
        IMU imu = hardwareMap.get(IMU.class, "imu");
        OverTime.Constants constants = new OverTime.Constants();
        constants.refVoltage = 12.52;
        OverTime runner = new OverTime(this, frontLeftMotor, frontRightMotor, backLeftMotor, backRightMotor, imu, constants);

        org.firstinspires.ftc.teamcode.AutoMechanisms.register(this, runner);

        runner.showInit();
        waitForStart();
        if (isStopRequested()) return;

        runner.begin(-90.0);
        runner.drive(0.0, 1.0, 2150);
        runner.pushWall(OverTime.Face.FRONT, 0.3, 1000, true);
        runner.turnTo(0.0, 0.5);
        runner.drive(69.0, 1.0, 1574);
        runner.stop();
    }
}
`;
    const p = parsed(code);
    expect(p.name).toBe('RedAuto');
    expect(p.startHeading).toBe(-90);
    expect(noIds(p.steps)).toEqual([
      { kind: 'drive', dirDeg: 0, power: 1, ms: 2150 },
      { kind: 'wall', face: 'front', power: 0.3, ms: 1000, alignHeading: true },
      { kind: 'turn', heading: 0, power: 0.5 },
      { kind: 'drive', dirDeg: 69, power: 1, ms: 1574 },
    ]);
    expect(p.skipped).toEqual([]);
  });

  it('handles comments, chains, sleep, casts and hand-written lines', () => {
    const code = [
      'Servo wrist = hardwareMap.get(Servo.class, "wrist_servo");',
      'DcMotorEx lift = (DcMotorEx) hardwareMap.get(DcMotorEx.class, "lift");',
      'OverTime bot = new OverTime(this, a, b, c, d, imu, k);',
      'waitForStart();',
      'bot.begin(90); // start facing the wall',
      '/* bot.drive(0, 1, 9999); */',
      'bot.drive(0, 0.5, 500L).turnTo(-45, 0.4);',
      'sleep(300);',
      'telemetry.addLine("hi");',
      'bot.servo(wrist, 0.25);',
      'bot.startMotor(lift, 0.6, (long) 700);',
      'bot.startCommand("intake in", 900, null);',
      'lift.setPower(0.2);',
      'bot.drive(0, POWER, 400);',
      'bot.stop();',
      'bot.drive(0, 1, 100);',
    ].join('\n');
    const p = parsed(code, { ...hw, commands: [] });
    expect(p.startHeading).toBe(90);
    expect(noIds(p.steps).map((s) => s.kind)).toEqual(['drive', 'turn', 'wait', 'servo', 'motor', 'command']);
    expect(p.steps[0]).toMatchObject({ ms: 500 });
    expect(p.steps[2]).toMatchObject({ kind: 'wait', ms: 300 });
    expect(p.steps[4]).toMatchObject({ power: 0.6, ms: 700, background: true });
    expect(p.steps[5]).toMatchObject({ name: 'intake in', ms: 900, background: true, stopCommand: '' });
    expect(p.newMechanisms.map((m) => [m.javaName, m.kind, m.hardwareName])).toEqual([
      ['wrist', 'servo', 'wrist_servo'],
      ['lift', 'motor', 'lift'],
    ]);
    expect(p.newCommands).toEqual(['intake in']);
    expect(p.skipped).toEqual([
      { line: 13, text: 'lift.setPower(0.2)' },
      { line: 14, text: 'bot.drive(0, POWER, 400)' },
    ]);
  });

  it('refuses a drive motor or a servo used as a motor', () => {
    const p = parsed('OverTime runner = new OverTime(this, fl, fr, bl, br, imu, k);\nrunner.begin(0);\nrunner.motor(fl, 1, 100);\nrunner.motor(clawServo, 1, 100);');
    expect(p.steps).toEqual([]);
    expect(p.skipped.map((s) => s.line)).toEqual([3, 4]);
  });

  it('explains empty or unrelated code', () => {
    expect(parseAuto('   ', hw)).toEqual({ ok: false, error: 'parse.empty' });
    expect(parseAuto('public class A { void x() { y(); } }', hw)).toEqual({ ok: false, error: 'parse.noRunner' });
  });
});

describe('running actions alongside drives', () => {
  it('a background action takes no time in the sequence but shows its own time', () => {
    const sim = simulate(auto, cal, hw, defaultView());
    expect(sim.steps[0]).toMatchObject({ ms: 0, bgMs: 1500, startMs: 0 });
    expect(sim.steps[1]).toMatchObject({ startMs: 0, ms: 600 });
    expect(sim.steps[5]).toMatchObject({ ms: 800 });
    expect(sim.steps[6]).toMatchObject({ ms: 0, bgMs: 1200 });
    expect(sim.steps[5].bgMs).toBeUndefined();
  });

  it('generates startMotor / startCommand', () => {
    const code = generateAuto(auto, hw, cal).code;
    expect(code).toContain('runner.startCommand("intake in", 1500, "intake off");');
    expect(code).toContain('runner.startMotor(intake, 1.0, 1200);');
    expect(code).toContain('runner.motor(intake, -1.0, 800);');
    const noStop = generateAuto({ ...auto, steps: [{ id: 'x', kind: 'command', name: 'intake in', ms: 900, background: true, stopCommand: '' }] }, hw, cal).code;
    expect(noStop).toContain('runner.command("intake in", 0);');
  });

  it('guesses the stop command', () => {
    const cmds = ['intake in', 'intake out', 'intake off', 'shooter on', 'shooter off', 'shoot'];
    expect(guessStopCommand('intake in', cmds)).toBe('intake off');
    expect(guessStopCommand('Intake Out', cmds)).toBe('intake off');
    expect(guessStopCommand('shooter on', cmds)).toBe('shooter off');
    expect(guessStopCommand('shoot', cmds)).toBe('');
  });
});

describe('applying parsed code', () => {
  const st = () => usePlanner.getState();
  const active = () => st().autos.find((a) => a.id === st().activeId)!;

  beforeEach(() => {
    st().restore({ autos: [{ id: 'a', name: 'Old', start: { x: 40, y: -20, heading: 0 }, steps: [] }], hw });
    usePlanner.setState({ past: [], future: [] });
  });

  it('replaces the active auto but keeps its start position, and undo brings it back', () => {
    const p = parsed(generateAuto(auto, hw, cal).code);
    st().applyParsed(p, false);
    expect(st().autos).toHaveLength(1);
    expect(active()).toMatchObject({ id: 'a', name: 'Red Left', start: { x: 40, y: -20, heading: 180 } });
    expect(active().steps).toHaveLength(auto.steps.length);
    st().undo();
    expect(active()).toMatchObject({ name: 'Old', steps: [] });
  });

  it('adds a new auto and the new mechanisms and commands', () => {
    const p = parsed('Servo wrist = hardwareMap.get(Servo.class, "w");\nOverTime runner = new OverTime(this, a, b, c, d, i, k);\nrunner.begin(45);\nrunner.servo(wrist, 1);\nrunner.command("park", 0);');
    st().applyParsed(p, true);
    expect(st().autos).toHaveLength(2);
    expect(active()).toMatchObject({ start: { heading: 45 }, steps: [{ kind: 'servo', position: 1 }, { kind: 'command', name: 'park' }] });
    expect(st().hw.mechanisms.map((m) => m.javaName)).toContain('wrist');
    expect(st().hw.commands).toContain('park');
    expect(active().steps[0]).toMatchObject({ mechanismId: st().hw.mechanisms.find((m) => m.javaName === 'wrist')!.id });
  });
});
