import tunerSource from '../../java/OverPathAutoTune.java?raw';
import { DEFAULT_ROBOT, type RobotSize } from '../compile/anchors';
import type { HardwareConfig } from '../model/types';
import { RUNNER_DEFAULTS, hardwareInitLines, usedMotorKeys, validateConfig, type ConfigIssue } from './java';
import { jDouble, javaString } from './javaIdent';

export const CALIBRATION_CLASS = 'OverPathCalibration';
export const FILES_PORT = 10159;

function nestedTuner(): { imports: string[]; lines: string[] } {
  const src = tunerSource.replace(/\r\n/g, '\n').split('\n');
  const imports = src.filter((l) => l.startsWith('import ')).map((l) => l.slice(7, -1).trim());
  const lastImport = src.reduce((last, line, index) => (line.startsWith('import ') ? index : last), -1);
  const start = src.findIndex((line, index) => index > lastImport && line.trim() !== '');
  const body = src.slice(start).join('\n').replace('public final class OverPathAutoTune', 'static final class OverPathAutoTune').trimEnd();
  return { imports, lines: body.split('\n').map((l) => (l ? '    ' + l : l)) };
}

const WHEEL_LABEL = {
  leftFront: 'Front left',
  rightFront: 'Front right',
  leftBack: 'Back left',
  rightBack: 'Back right',
} as const;

export interface CalibrationResult {
  code: string;
  className: string;
  errors: ConfigIssue[];
}

function localNames(exprs: string[]): string[] {
  const used = new Set<string>();
  return exprs.map((e) => {
    const base = e.split('.').pop() || 'device';
    let name = base;
    for (let i = 2; used.has(name); i++) name = `${base}${i}`;
    used.add(name);
    return name;
  });
}

export function generateCalibrationOpMode(config: HardwareConfig, robot: RobotSize = DEFAULT_ROBOT): CalibrationResult {
  const keys = usedMotorKeys(config);
  const tank = config.drivetrain === 'tank';
  const twoMotor = keys.length === 2;
  const names = localNames([...keys.map((k) => config.motors[k]), config.imu]);
  const local = new Map<string, string>();
  [...keys.map((k) => config.motors[k]), config.imu].forEach((e, i) => local.set(e, names[i]));
  const v = (expr: string) => local.get(expr) ?? expr;

  const asDeclared: HardwareConfig = {
    ...config,
    output: 'opmode',
    emitHardwareMapInit: true,
    motors: { ...config.motors, ...Object.fromEntries(keys.map((k) => [k, v(config.motors[k])])) },
    imu: v(config.imu),
    mechanisms: [],
    commands: [],
  };
  const errors = validateConfig(asDeclared).filter((e) =>
    ['motors.', 'imu', 'hardwareNames.', 'hubUsb', 'runnerPackage', 'packageName', 'constants.'].some((p) => e.path.startsWith(p)),
  );

  const hw = hardwareInitLines(config, [], v);
  const imports = new Set<string>([
    ...hw.imports,
    'com.qualcomm.robotcore.eventloop.opmode.LinearOpMode',
    'com.qualcomm.robotcore.eventloop.opmode.TeleOp',
    'com.qualcomm.robotcore.hardware.DcMotor',
    'com.qualcomm.robotcore.util.ElapsedTime',
    'org.firstinspires.ftc.robotcore.external.navigation.AngleUnit',
  ]);
  if (config.runnerPackage !== config.packageName) imports.add(`${config.runnerPackage}.OverPath`);
  const tuner = nestedTuner();
  for (const i of tuner.imports) if (!i.endsWith('.OverPath')) imports.add(i);

  const c = config.constants;
  const wheelVars = keys.map((k) => v(config.motors[k])).join(', ');
  const wheelLabels = keys
    .map((k) => javaString(`${twoMotor ? (k === 'leftFront' ? 'Left' : 'Right') : WHEEL_LABEL[k]} (${config.motors[k]})`))
    .join(', ');
  const runnerMotors = twoMotor ? 'calibWheels[0], calibWheels[1], null, null' : 'calibWheels[0], calibWheels[1], calibWheels[2], calibWheels[3]';
  const tunables = (Object.keys(RUNNER_DEFAULTS) as (keyof typeof RUNNER_DEFAULTS)[])
    .filter((k) => Math.abs(c[k] - RUNNER_DEFAULTS[k]) > 1e-9)
    .map((k) => `        r.${k} = ${jDouble(c[k], 6)};`);

  const buttons = tank
    ? 'dpad up = wheel test (lift the robot!), A = drive 48 in, X = turn 90 and back, dpad down = wall square, Y = stop a test'
    : 'dpad up = wheel test (lift the robot!), A = drive 48 in, B = strafe 48 in, X = turn 90 and back, dpad down = wall square, Y = stop a test';
  const autoButtons =
    'AUTO-TUNE: dpad left = direction check (on the floor), left bumper = auto-tune (4 ft clear around), ' +
    'right bumper = wall tests (back against a wall), dpad right = venue check (back against a wall, ~2 min)';
  const profile = javaString(config.activeProfile);

  const body = [
    ...hw.lines,
    '',
    `calibWheels = new DcMotor[] {${wheelVars}};`,
    `calibNames = new String[] {${wheelLabels}};`,
    `calibImu = ${v(config.imu)};`,
    `double ticksPerRev = ${jDouble(c.ticksPerRev, 3)};`,
    `double gearRatio = ${jDouble(c.gearRatio, 4)};`,
    `double wheelDiameterIn = ${jDouble(c.wheelDiameterIn, 3)};`,
    `double strafeMultiplier = ${jDouble(c.strafeMultiplier, 3)};`,
    'constants = new OverPath.Constants(ticksPerRev, gearRatio, wheelDiameterIn, strafeMultiplier);',
    `tuner = new OverPathAutoTune(OverPath.Drive.${tank ? 'TANK' : 'MECANUM'}, ${runnerMotors}, calibImu, constants, hardwareMap, telemetry,`,
    '        () -> opModeIsActive() && !gamepad1.y, calibNames);',
    `tuner.robotLengthIn = ${jDouble(robot.lengthIn)};`,
    `tuner.robotWidthIn = ${jDouble(robot.widthIn)};`,
    `tuner.dropRate = ${jDouble(c.maxPowerDropPerS, 4)};`,
    `tuner.rampIn = ${jDouble(c.rampIn, 4)};`,
    'try {',
    `    files = new OverPathAutoTune.FileServer(${FILES_PORT});`,
    '} catch (java.io.IOException e) {',
    '    files = null;',
    '}',
    '',
    'telemetry.addLine("OverPath Calibration ready. Press START.");',
    'telemetry.update();',
    'waitForStart();',
    '',
    'try {',
    'while (opModeIsActive()) {',
    '    if (gamepad1.dpad_left) {',
    `        autoTest("direction check", tuner.directions(), ${profile});`,
    '    } else if (gamepad1.left_bumper) {',
    `        autoTest("auto-tune", tuner.minPower() && tuner.speedAndBraking() && tuner.turnRadius(), ${profile});`,
    '    } else if (gamepad1.right_bumper) {',
    `        autoTest("wall tests", tuner.gripLimits() && tuner.wallTripsBoth(5), ${profile});`,
    '    } else if (gamepad1.dpad_right) {',
    '        autoTest("venue check", tuner.venueCheck(), "competition");',
    '    } else if (gamepad1.dpad_up) {',
    '        wheelTest();',
    '    } else if (gamepad1.a) {',
    '        runTest("drive 48 in", newRunner().drive(48, 0.5),',
    '                "Measure how far the robot really drove. In the planner: Settings > Constants > drive(48) went.");',
    ...(tank
      ? []
      : [
          '    } else if (gamepad1.b) {',
          '        runTest("strafe 48 in (right)", newRunner().strafe(48, 0.5),',
          '                "Measure how far the robot really strafed. In the planner: Settings > Constants > strafe(48) went.");',
        ]),
    '    } else if (gamepad1.x) {',
    '        runTest("turn 90 and back", newRunner().turnTo(90, 0.5).waitMs(500).turnTo(0, 0.5),',
    '                "Heading should end near 0. Wobbles: lower turnKp. Stops short: raise turnMinPower.");',
    '    } else if (gamepad1.dpad_down) {',
    `        runTest("wall square (back)", newRunner().setStartPose(0, -72 + ${jDouble(robot.lengthIn / 2 + 6)}, 90)`,
    '                        .squareToWall(OverPath.Wall.REAR, OverPath.Face.BACK, 0.3),',
    '                "The robot should end flush, then 1 in off the wall. The Pose line shows the re-zeroed heading.");',
    '    }',
    '    showMenu();',
    '}',
    '} finally {',
    '    if (files != null) files.close();',
    '}',
  ];

  const loopStart = body.indexOf('while (opModeIsActive()) {');
  const loopEnd = body.indexOf('} finally {');
  for (let i = loopStart; i > 0 && i < loopEnd; i++) if (body[i]) body[i] = '    ' + body[i];
  const ind = (l: string, n: number) => (l ? ' '.repeat(n) + l : l);
  const code = [
    `package ${config.packageName};`,
    '',
    ...[...imports].sort().map((i) => `import ${i};`),
    '',
    `@TeleOp(name = "OverPath Calibration", group = ${javaString(config.opModeGroup || 'OverPath')})`,
    `public class ${CALIBRATION_CLASS} extends LinearOpMode {`,
    '',
    '    private DcMotor[] calibWheels;',
    '    private String[] calibNames;',
    '    private IMU calibImu;',
    '    private OverPath.Constants constants;',
    '    private OverPathAutoTune tuner;',
    '    private OverPathAutoTune.FileServer files;',
    '    private String result = "Press a button to start a test.";',
    '    private String hint = "";',
    '',
    '    @Override',
    '    public void runOpMode() {',
    ...body.map((l) => ind(l, 8)),
    '    }',
    '',
    '    private void wheelTest() {',
    '        StringBuilder summary = new StringBuilder();',
    '        for (int i = 0; i < calibWheels.length && opModeIsActive() && !gamepad1.y; i++) {',
    '            for (DcMotor m : calibWheels) m.setPower(0);',
    '            int start = calibWheels[i].getCurrentPosition();',
    '            calibWheels[i].setPower(0.3);',
    '            ElapsedTime t = new ElapsedTime();',
    '            while (opModeIsActive() && t.seconds() < 1.0 && !gamepad1.y) {',
    '                telemetry.addLine("WHEEL TEST " + (i + 1) + "/" + calibWheels.length + ": " + calibNames[i]);',
    '                telemetry.addLine("It must spin so the robot would drive FORWARD.");',
    '                telemetry.addLine("Spinning backwards? Tick Reversed for it in the planner (Settings > Code output).");',
    '                telemetry.addData("Encoder ticks", calibWheels[i].getCurrentPosition() - start);',
    '                telemetry.update();',
    '            }',
    '            calibWheels[i].setPower(0);',
    '            int moved = calibWheels[i].getCurrentPosition() - start;',
    '            summary.append(calibNames[i]).append(": ").append(moved).append(" ticks");',
    '            if (Math.abs(moved) < 20) summary.append(" <- NO ENCODER COUNTS, check the encoder cable");',
    '            else if (moved < 0) summary.append(" <- counts BACKWARDS, OverPath needs + ticks going forward");',
    '            summary.append("; ");',
    '            sleep(300);',
    '        }',
    '        for (DcMotor m : calibWheels) m.setPower(0);',
    '        result = "Wheel test done.";',
    '        hint = summary.toString();',
    '        waitForRelease();',
    '    }',
    '',
    '    private OverPath newRunner() {',
    `        OverPath r = new OverPath(OverPath.Drive.${tank ? 'TANK' : 'MECANUM'}, ${runnerMotors}, calibImu, constants);`,
    '        r.useHardwareMap(hardwareMap);',
    '        r.setStartHeading(0);',
    `        r.robotLengthIn = ${jDouble(robot.lengthIn)};`,
    `        r.robotWidthIn = ${jDouble(robot.widthIn)};`,
    ...tunables,
    '        return r;',
    '    }',
    '',
    '    private void runTest(String name, OverPath r, String afterHint) {',
    '        int[] start = ticks();',
    '        r.start();',
    '        while (opModeIsActive() && r.isBusy()) {',
    '            if (gamepad1.y) {',
    '                r.stop();',
    '                result = name + ": stopped.";',
    '                hint = "";',
    '                waitForRelease();',
    '                return;',
    '            }',
    '            r.update();',
    '            telemetry.addLine("Running: " + name + "   (Y = stop)");',
    '            r.addTelemetry(telemetry);',
    '            telemetry.update();',
    '        }',
    '        r.stop();',
    '        int[] end = ticks();',
    '        double sum = 0;',
    '        for (int i = 0; i < end.length; i++) sum += Math.abs(end[i] - start[i]);',
    '        double inches = sum / end.length / constants.ticksPerInch();',
    '        result = String.format("%s done. Encoders say %.1f in per wheel, heading %.1f deg.", name, inches, heading());',
    '        hint = afterHint;',
    '        waitForRelease();',
    '    }',
    '',
    '    private void autoTest(String name, boolean ok, String profile) {',
    '        boolean saved = tuner.save(profile);',
    '        result = name + (ok ? " done." : " stopped.") + (saved ? " Saved calibration.json." : " Could not save calibration.json.");',
    '        StringBuilder sb = new StringBuilder();',
    '        for (String line : tuner.summary()) sb.append(line).append("\\n");',
    '        for (String line : tuner.report) sb.append(line).append("\\n");',
    '        hint = sb.toString().trim();',
    '        waitForRelease();',
    '    }',
    '',
    '    private void showMenu() {',
    `        telemetry.addLine(${javaString(buttons)});`,
    `        telemetry.addLine(${javaString(autoButtons)});`,
    `        if (files != null) telemetry.addLine("Files: http://192.168.43.1:${FILES_PORT}  (robot Wi-Fi, then import in the planner)");`,
    '        telemetry.addLine(result);',
    '        if (!hint.isEmpty()) telemetry.addLine(hint);',
    '        telemetry.addData("Heading", "%.1f deg", heading());',
    '        for (int i = 0; i < calibWheels.length; i++) telemetry.addData(calibNames[i], calibWheels[i].getCurrentPosition());',
    '        telemetry.update();',
    '    }',
    '',
    '    private int[] ticks() {',
    '        int[] t = new int[calibWheels.length];',
    '        for (int i = 0; i < t.length; i++) t[i] = calibWheels[i].getCurrentPosition();',
    '        return t;',
    '    }',
    '',
    '    private double heading() {',
    '        return calibImu.getRobotYawPitchRollAngles().getYaw(AngleUnit.DEGREES);',
    '    }',
    '',
    '    private void waitForRelease() {',
    '        while (opModeIsActive() && (gamepad1.a || gamepad1.b || gamepad1.x || gamepad1.y || gamepad1.dpad_up || gamepad1.dpad_down',
    '                || gamepad1.dpad_left || gamepad1.dpad_right || gamepad1.left_bumper || gamepad1.right_bumper)) idle();',
    '    }',
    '',
    ...tuner.lines,
    '}',
    '',
  ].join('\n');

  return { code, className: CALIBRATION_CLASS, errors };
}
