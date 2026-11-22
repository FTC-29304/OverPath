import runnerSource from '../../../java/OverTime.java?raw';
import { wrapDeg } from '../geometry/transform';
import type { Auto, Calibration, HardwareConfig, Mechanism, MotorKey, RobotFace, Step } from '../model/types';

export const RUNNER_VERSION = /VERSION = "([^"]+)"/.exec(runnerSource)?.[1] ?? '?';

const JAVA_KEYWORDS = new Set(
  'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null var record yield'.split(
    ' ',
  ),
);

export function className(name: string): string {
  const words = name.replace(/[^A-Za-z0-9_ ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  let s = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('') || 'OverTimeAuto';
  if (/^[0-9]/.test(s)) s = `Auto${s}`;
  if (JAVA_KEYWORDS.has(s)) s = `${s}Auto`;
  return s;
}

export function javaString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

export function dbl(n: number): string {
  const r = Math.round(n * 10000) / 10000 + 0;
  return Number.isInteger(r) ? `${r}.0` : String(r);
}

const FACE_JAVA: Record<RobotFace, string> = { front: 'FRONT', back: 'BACK', left: 'LEFT', right: 'RIGHT' };
const MOTOR_VARS: Record<MotorKey, string> = {
  frontLeft: 'frontLeftMotor',
  frontRight: 'frontRightMotor',
  backLeft: 'backLeftMotor',
  backRight: 'backRightMotor',
};
const MOTOR_KEYS: MotorKey[] = ['frontLeft', 'frontRight', 'backLeft', 'backRight'];

function mechanismFor(hw: HardwareConfig, id: string): Mechanism | undefined {
  return hw.mechanisms.find((m) => m.id === id);
}

function stepLine(step: Step, hw: HardwareConfig): string | null {
  switch (step.kind) {
    case 'drive':
      return `runner.drive(${dbl(step.dirDeg)}, ${dbl(step.power)}, ${Math.round(step.ms)});`;
    case 'turn':
      return `runner.turnTo(${dbl(wrapDeg(step.heading))}, ${dbl(step.power)});`;
    case 'wall':
      return `runner.pushWall(OverTime.Face.${FACE_JAVA[step.face]}, ${dbl(step.power)}, ${Math.round(step.ms)}, ${step.alignHeading});`;
    case 'wait':
      return `runner.waitMs(${Math.round(step.ms)});`;
    case 'servo': {
      const m = mechanismFor(hw, step.mechanismId);
      if (!m || m.kind !== 'servo') return null;
      return `runner.servo(${m.javaName}, ${dbl(step.position)});`;
    }
    case 'motor': {
      const m = mechanismFor(hw, step.mechanismId);
      if (!m || m.kind === 'servo') return null;
      return `runner.${step.background ? 'startMotor' : 'motor'}(${m.javaName}, ${dbl(step.power)}, ${Math.round(step.ms)});`;
    }
    case 'command':
      if (!step.name) return null;
      if (step.background && step.ms > 0 && step.stopCommand) {
        return `runner.startCommand(${javaString(step.name)}, ${Math.round(step.ms)}, ${javaString(step.stopCommand)});`;
      }
      return `runner.command(${javaString(step.name)}, ${step.background ? 0 : Math.round(step.ms)});`;
  }
}

function constantsBlock(cal: Calibration, hw: HardwareConfig, calibrationRun: boolean): string[] {
  return [
    'OverTime.Constants constants = new OverTime.Constants();',
    calibrationRun
      ? 'constants.refVoltage = 0;'
      : `constants.refVoltage = ${dbl(cal.refVoltage)};`,
    `constants.rampMs = ${Math.round(cal.rampMs)};`,
    `constants.headingKp = ${dbl(hw.headingKp)};`,
    `constants.headingKi = ${dbl(hw.headingKi)};`,
    `constants.turnKp = ${dbl(hw.turnKp)};`,
    `constants.turnMinPower = ${dbl(hw.turnMinPower)};`,
    `constants.turnTolDeg = ${dbl(hw.turnTolDeg)};`,
    `constants.turnTimeoutMs = ${Math.round(hw.turnTimeoutMs)};`,
    `constants.squareMs = ${Math.round(cal.squareMs)};`,
    `constants.backOffMs = ${Math.round(cal.backOffMs)};`,
    `constants.backOffPower = ${dbl(cal.backOffPower)};`,
    `constants.autoLimitMs = ${calibrationRun ? 0 : 30000};`,
  ];
}

function hardwareBlock(hw: HardwareConfig, mechanisms: Mechanism[]): string[] {
  const lines: string[] = [];
  for (const k of MOTOR_KEYS) {
    lines.push(`DcMotor ${MOTOR_VARS[k]} = hardwareMap.get(DcMotor.class, ${javaString(hw.motors[k])});`);
  }
  for (const k of MOTOR_KEYS) {
    lines.push(`${MOTOR_VARS[k]}.setDirection(DcMotorSimple.Direction.${hw.reversed[k] ? 'REVERSE' : 'FORWARD'});`);
  }
  lines.push(
    `IMU imu = hardwareMap.get(IMU.class, ${javaString(hw.imu)});`,
    'imu.initialize(new IMU.Parameters(new RevHubOrientationOnRobot(',
    `        RevHubOrientationOnRobot.LogoFacingDirection.${hw.hubLogo},`,
    `        RevHubOrientationOnRobot.UsbFacingDirection.${hw.hubUsb})));`,
  );
  for (const m of mechanisms) {
    const type = m.kind === 'servo' ? 'Servo' : m.kind === 'crservo' ? 'CRServo' : 'DcMotor';
    lines.push(`${type} ${m.javaName} = hardwareMap.get(${type}.class, ${javaString(m.hardwareName || m.javaName)});`);
  }
  return lines;
}

function imports(hw: HardwareConfig, mechanisms: Mechanism[], annotation: 'Autonomous' | 'TeleOp'): string[] {
  const types = new Set(mechanisms.map((m) => (m.kind === 'servo' ? 'Servo' : m.kind === 'crservo' ? 'CRServo' : 'DcMotor')));
  return [
    'import com.qualcomm.hardware.rev.RevHubOrientationOnRobot;',
    `import com.qualcomm.robotcore.eventloop.opmode.${annotation};`,
    'import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;',
    ...(types.has('CRServo') ? ['import com.qualcomm.robotcore.hardware.CRServo;'] : []),
    'import com.qualcomm.robotcore.hardware.DcMotor;',
    'import com.qualcomm.robotcore.hardware.DcMotorSimple;',
    'import com.qualcomm.robotcore.hardware.IMU;',
    ...(types.has('Servo') ? ['import com.qualcomm.robotcore.hardware.Servo;'] : []),
    '',
    `import ${hw.runnerPackage}.OverTime;`,
  ];
}

const indent = (lines: string[], n: number) => lines.map((l) => (l ? ' '.repeat(n) + l : l));

export function generateAuto(auto: Auto, hw: HardwareConfig, cal: Calibration): { fileName: string; code: string } {
  const cls = className(auto.name);
  const used = hw.mechanisms.filter((m) =>
    auto.steps.some((s) => (s.kind === 'servo' || s.kind === 'motor') && s.mechanismId === m.id && (s.kind === 'servo') === (m.kind === 'servo')),
  );
  const commands = [
    ...new Set(
      auto.steps
        .filter((s): s is Extract<Step, { kind: 'command' }> => s.kind === 'command' && !!s.name)
        .flatMap((s) => (s.background && s.ms > 0 && s.stopCommand ? [s.name, s.stopCommand] : [s.name])),
    ),
  ];
  const body = [
    ...hardwareBlock(hw, used),
    '',
    ...constantsBlock(cal, hw, false),
    'OverTime runner = new OverTime(this, frontLeftMotor, frontRightMotor, backLeftMotor, backRightMotor, imu, constants);',
    ...(hw.commandSetup.trim()
      ? ['', hw.commandSetup.trim()]
      : [...(commands.length ? [''] : []), ...commands.map((c) => `runner.registerCommand(${javaString(c)}, () -> {\n});`)]),
    '',
    ...(cal.measured ? [] : ['telemetry.addLine("Calibration not measured yet: distances are a guess");']),
    'runner.showInit();',
    'waitForStart();',
    'if (isStopRequested()) return;',
    '',
    `runner.begin(${dbl(wrapDeg(auto.start.heading))});`,
    ...auto.steps.map((s) => stepLine(s, hw)).filter((line): line is string => line !== null),
    'runner.stop();',
  ].flatMap((l) => l.split('\n'));

  const code = [
    `package ${hw.packageName};`,
    '',
    ...imports(hw, used, 'Autonomous'),
    '',
    `@Autonomous(name = ${javaString(auto.name)}, group = ${javaString(hw.opModeGroup)})`,
    `public class ${cls} extends LinearOpMode {`,
    '    @Override',
    '    public void runOpMode() {',
    ...indent(body, 8),
    '    }',
    '}',
    '',
  ].join('\n');
  return { fileName: `${cls}.java`, code };
}

export function generateCalibration(hw: HardwareConfig, cal: Calibration): { fileName: string; code: string } {
  const p = dbl(cal.calPower);
  const body = [
    ...hardwareBlock(hw, []),
    '',
    ...constantsBlock(cal, hw, true),
    'OverTime runner = new OverTime(this, frontLeftMotor, frontRightMotor, backLeftMotor, backRightMotor, imu, constants);',
    `double power = ${p};`,
    'String last = "Put the robot on a mark, then press a button.";',
    'double spinRate = 0;',
    '',
    'runner.showInit();',
    'waitForStart();',
    'runner.begin(0);',
    'while (opModeIsActive()) {',
    '    long ms = 0;',
    '    double dir = 0;',
    '    if (gamepad1.a) { ms = 1000; dir = 0; }',
    '    else if (gamepad1.b) { ms = 2000; dir = 0; }',
    '    else if (gamepad1.x) { ms = 1000; dir = 90; }',
    '    else if (gamepad1.y) { ms = 2000; dir = 90; }',
    '    if (ms > 0) {',
    '        double volts = runner.batteryVoltage();',
    '        sleep(300);',
    '        runner.drive(dir, power, ms);',
    '        last = String.format("%s %.1f s at %.2f V: measure the distance now", dir == 0 ? "Forward" : "Strafe left", ms / 1000.0, volts);',
    '    } else if (gamepad1.dpad_up) {',
    '        sleep(300);',
    '        spinRate = runner.spinTest(power, 2000);',
    '        last = String.format("Spin: %.0f deg/s (type this into the planner)", spinRate);',
    '    }',
    '    telemetry.addData("Battery (at rest)", "%.2f V  <- type this into the planner", runner.batteryVoltage());',
    '    telemetry.addData("Test power", "%.2f", power);',
    '    telemetry.addLine("A: forward 1.0 s   B: forward 2.0 s");',
    '    telemetry.addLine("X: strafe left 1.0 s   Y: strafe left 2.0 s");',
    '    telemetry.addLine("D-pad up: spin test (2 s)");',
    '    telemetry.addData("Last", last);',
    '    telemetry.update();',
    '    idle();',
    '}',
    'runner.stop();',
  ];
  const code = [
    `package ${hw.packageName};`,
    '',
    ...imports(hw, [], 'TeleOp'),
    '',
    `@TeleOp(name = "OverTimeCalibration", group = ${javaString(hw.opModeGroup)})`,
    'public class OverTimeCalibration extends LinearOpMode {',
    '    @Override',
    '    public void runOpMode() {',
    ...indent(body, 8),
    '    }',
    '}',
    '',
  ].join('\n');
  return { fileName: 'OverTimeCalibration.java', code };
}

export function runnerFile(hw: HardwareConfig): { fileName: string; code: string } {
  return { fileName: 'OverTime.java', code: runnerSource.replace(/^package [^;]+;/m, `package ${hw.runnerPackage};`) };
}
