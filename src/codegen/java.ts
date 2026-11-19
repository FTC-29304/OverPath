import { DEFAULT_ROBOT, type RobotSize } from '../compile/anchors';
import { compile, type CompileResult } from '../compile/compile';
import { simulate } from '../sim/simulate';
import { msg, type Msg, type MsgKey } from '../i18n/translate';
import type { Auto, HardwareConfig, LogoDirection, Mechanism, MarkerAction, MotorKey, Step } from '../model/types';
import {
  isJavaExpressionPath,
  isJavaIdentifier,
  isPackageName,
  javaString,
  jDouble,
  jLong,
  toClassName,
} from './javaIdent';

export interface ConfigIssue {
  path: string;
  message: Msg;
}

export interface GenerateResult {
  code: string;
  className: string;
  errors: ConfigIssue[];
  warnings: Msg[];
  estSeconds: number;
  stepCount: number;
}

export const RUNNER_DEFAULTS = {
  headingKp: 0.02,
  turnKp: 0.015,
  turnTolDeg: 1.5,
  minPower: 0.15,
  turnMinPower: 0.12,
  rampIn: 6,
  maxPowerRatePerS: 2,
  maxPowerDropPerS: 4,
  brakeLinear: 0.08,
  brakeQuadratic: 0,
  turnRadiusIn: 12,
} as const;

const MOTOR_KEYS: MotorKey[] = ['leftFront', 'rightFront', 'leftBack', 'rightBack'];

export function usedMotorKeys(config: HardwareConfig): MotorKey[] {
  return config.drivetrain === 'tank' && config.tankMotorCount === 2 ? ['leftFront', 'rightFront'] : MOTOR_KEYS;
}

export function motorLabel(config: HardwareConfig, key: MotorKey): MsgKey {
  if (config.drivetrain === 'tank' && config.tankMotorCount === 2) return key === 'leftFront' ? 'motor.left' : 'motor.right';
  return `motor.${key}`;
}

const AXIS: Record<LogoDirection, string> = { UP: 'z', DOWN: 'z', LEFT: 'y', RIGHT: 'y', FORWARD: 'x', BACKWARD: 'x' };

function usedMechanisms(steps: Step[], config: HardwareConfig): Mechanism[] {
  const ids = new Set<string>();
  for (const s of steps) {
    if (s.kind === 'servo' || s.kind === 'motor') ids.add(s.mechanismId);
    if (s.kind === 'move') for (const m of s.markers) if (m.action.kind !== 'command') ids.add(m.action.mechanismId);
  }
  return config.mechanisms.filter((m) => ids.has(m.id));
}

function usedCommands(steps: Step[], config: HardwareConfig): string[] {
  const names: string[] = [];
  const add = (n: string) => {
    if (n && !names.includes(n)) names.push(n);
  };
  config.commands.forEach((c) => add(c.trim()));
  for (const s of steps) {
    if (s.kind === 'command') add(s.name);
    if (s.kind === 'move') for (const m of s.markers) if (m.action.kind === 'command') add(m.action.name);
  }
  return names;
}

export function validateConfig(config: HardwareConfig, compiled?: CompileResult): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const opmode = config.output === 'opmode';
  const declare = opmode && config.emitHardwareMapInit;
  const check = (path: string, value: string, what: Msg) => {
    if (!value.trim()) issues.push({ path, message: msg('cfg.empty', { what }) });
    else if (declare ? !isJavaIdentifier(value) : !isJavaExpressionPath(value))
      issues.push({ path, message: msg(declare ? 'cfg.plainName' : 'cfg.fieldPath', { what }) });
  };

  for (const key of usedMotorKeys(config)) check(`motors.${key}`, config.motors[key], msg(motorLabel(config, key)));
  check('imu', config.imu, msg('hw.imu'));
  if (!isJavaIdentifier(config.runnerVar)) issues.push({ path: 'runnerVar', message: msg('cfg.runnerVar') });
  if (!isPackageName(config.runnerPackage))
    issues.push({ path: 'runnerPackage', message: msg('cfg.runnerPackage') });
  if (opmode && !isPackageName(config.packageName))
    issues.push({ path: 'packageName', message: msg('cfg.opPackage') });

  config.mechanisms.forEach((m, i) => {
    check(`mechanisms.${i}.javaExpr`, m.javaExpr, msg('cfg.mechNamed', { label: m.label || i + 1 }));
    if (declare && !m.hardwareName.trim())
      issues.push({ path: `mechanisms.${i}.hardwareName`, message: msg('cfg.mechHwName', { label: m.label }) });
  });

  const seenCmd = new Set<string>();
  config.commands.forEach((c, i) => {
    if (!c.trim()) issues.push({ path: `commands.${i}`, message: msg('cfg.cmdEmpty') });
    else if (seenCmd.has(c.trim())) issues.push({ path: `commands.${i}`, message: msg('cfg.cmdDup', { name: c }) });
    seenCmd.add(c.trim());
  });

  if (declare) {
    const names = new Map<string, string>();
    const vars: [string, string][] = [
      ...usedMotorKeys(config).map((k) => [`motors.${k}`, config.motors[k]] as [string, string]),
      ['imu', config.imu],
      ...(compiled ? usedMechanisms(compiled.steps, config) : config.mechanisms).map(
        (m) => [`mechanisms.${config.mechanisms.indexOf(m)}.javaExpr`, m.javaExpr] as [string, string],
      ),
      ['runnerVar', config.runnerVar],
    ];
    for (const [path, v] of vars) {
      if (names.has(v)) issues.push({ path, message: msg('cfg.varDup', { name: v }) });
      names.set(v, path);
    }
    for (const key of usedMotorKeys(config))
      if (!config.hardwareNames[key].trim())
        issues.push({ path: `hardwareNames.${key}`, message: msg('cfg.hwName', { what: msg(motorLabel(config, key)) }) });
    if (!config.hardwareNames.imu.trim()) issues.push({ path: 'hardwareNames.imu', message: msg('cfg.hwName', { what: msg('hw.imu') }) });
    if (AXIS[config.hubLogo] === AXIS[config.hubUsb])
      issues.push({ path: 'hubUsb', message: msg('cfg.hubAxis') });
  }

  const c = config.constants;
  const positive: [keyof typeof c, MsgKey][] = [
    ['ticksPerRev', 'const.ticksPerRev'],
    ['gearRatio', 'const.gearRatio'],
    ['wheelDiameterIn', 'const.wheelDiameter'],
    ['strafeMultiplier', 'const.strafeMultiplier'],
    ['maxSpeedInPerSec', 'const.maxSpeed'],
    ['turnRateDegPerSec', 'const.turnRate'],
  ];
  for (const [k, label] of positive)
    if (!(c[k] > 0)) issues.push({ path: `constants.${k}`, message: msg('cfg.positive', { what: msg(label) }) });

  if (compiled) {
    const ids = new Set(config.mechanisms.map((m) => m.id));
    const missing = compiled.steps.some(
      (s) =>
        ((s.kind === 'servo' || s.kind === 'motor') && !ids.has(s.mechanismId)) ||
        (s.kind === 'move' && s.markers.some((m) => m.action.kind !== 'command' && !ids.has(m.action.mechanismId))),
    );
    if (missing) issues.push({ path: 'auto', message: msg('cfg.mechMissing') });
  }
  return issues;
}

function mechExpr(config: HardwareConfig, id: string): string {
  return config.mechanisms.find((m) => m.id === id)?.javaExpr || 'null';
}

function markerCall(config: HardwareConfig, t: number, a: MarkerAction): string {
  const tt = jDouble(t, 3);
  switch (a.kind) {
    case 'command':
      return `.marker(${tt}, ${javaString(a.name)})`;
    case 'servo':
      return `.marker(${tt}, () -> ${mechExpr(config, a.mechanismId)}.setPosition(${jDouble(a.position, 3)}))`;
    case 'motor':
      return `.marker(${tt}, () -> ${mechExpr(config, a.mechanismId)}.setPower(${jDouble(a.power)}))`;
  }
}

function stepLines(config: HardwareConfig, s: Step): string[] {
  const p = (n: number) => jDouble(n);
  const out: string[] = [];
  switch (s.kind) {
    case 'turnTo':
      out.push(`.turnTo(${jDouble(s.heading)}, ${p(s.power)})`);
      break;
    case 'move':
      out.push(`.driveTo(${jDouble(s.to.x)}, ${jDouble(s.to.y)}, ${p(s.power)})${s.reversed ? '.reversed()' : ''}`);
      for (const m of s.markers) out.push(`    ${markerCall(config, m.t, m.action)}`);
      break;
    case 'square':
      out.push(
        `.squareToWall(OverPath.Wall.${s.wall.toUpperCase()}, OverPath.Face.${s.face.toUpperCase()}, ${p(s.power)}` +
          `${s.align ? '' : ', false'})`,
      );
      break;
    case 'wait':
      out.push(`.waitMs(${jLong(s.ms)})`);
      break;
    case 'servo':
      out.push(`.servo(${mechExpr(config, s.mechanismId)}, ${jDouble(s.position, 3)})`);
      break;
    case 'motor': {
      const m = mechExpr(config, s.mechanismId);
      if (s.ms <= 0) out.push(`.motorPower(${m}, ${p(s.power)})`);
      else if (s.background) out.push(`.startMotorFor(${m}, ${p(s.power)}, ${jLong(s.ms)})`);
      else out.push(`.motorFor(${m}, ${p(s.power)}, ${jLong(s.ms)})`);
      break;
    }
    case 'command':
      if (s.ms <= 0) out.push(`.command(${javaString(s.name)})`);
      else if (s.background) out.push(`.startCommandFor(${javaString(s.name)}, ${jLong(s.ms)})`);
      else out.push(`.commandFor(${javaString(s.name)}, ${jLong(s.ms)})`);
      break;
  }
  if (s.timeoutMs > 0) out.push(`    .timeout(${jLong(s.timeoutMs)})`);
  return out;
}

function sequenceLines(auto: Auto, config: HardwareConfig, compiled: CompileResult, robot: RobotSize): string[] {
  const r = config.runnerVar;
  const c = config.constants;
  const keys = usedMotorKeys(config);
  const m = config.motors;
  const motors =
    keys.length === 2 ? `${m.leftFront}, ${m.rightFront}, null, null` : `${m.leftFront}, ${m.rightFront}, ${m.leftBack}, ${m.rightBack}`;
  const lines: string[] = [];
  lines.push(`double ticksPerRev = ${jDouble(c.ticksPerRev, 3)};`);
  lines.push(`double gearRatio = ${jDouble(c.gearRatio, 4)};`);
  lines.push(`double wheelDiameterIn = ${jDouble(c.wheelDiameterIn, 3)};`);
  lines.push(`double strafeMultiplier = ${jDouble(c.strafeMultiplier, 3)};`);
  lines.push('');
  lines.push(`OverPath ${r} = new OverPath(OverPath.Drive.${config.drivetrain === 'tank' ? 'TANK' : 'MECANUM'},`);
  lines.push(`        ${motors}, ${config.imu},`);
  lines.push('        new OverPath.Constants(ticksPerRev, gearRatio, wheelDiameterIn, strafeMultiplier));');
  if (config.output === 'opmode') lines.push(`${r}.useHardwareMap(hardwareMap);`);
  lines.push(`${r}.log(${javaString(auto.name.replace(/[^A-Za-z0-9_-]/g, '') || 'auto')});`);
  const start = compiled.arrivals[0];
  if (start) lines.push(`${r}.setStartPose(${jDouble(start.x)}, ${jDouble(start.y)}, ${jDouble(start.heading)});`);
  if (compiled.steps.some((st) => st.kind === 'square') || robot.lengthIn !== DEFAULT_ROBOT.lengthIn || robot.widthIn !== DEFAULT_ROBOT.widthIn) {
    lines.push(`${r}.robotLengthIn = ${jDouble(robot.lengthIn)};`);
    lines.push(`${r}.robotWidthIn = ${jDouble(robot.widthIn)};`);
  }

  for (const k of Object.keys(RUNNER_DEFAULTS) as (keyof typeof RUNNER_DEFAULTS)[]) {
    if (Math.abs(c[k] - RUNNER_DEFAULTS[k]) > 1e-9) lines.push(`${r}.${k} = ${jDouble(c[k], 6)};`);
  }

  const cmds = usedCommands(compiled.steps, config);
  const timed = new Set(compiled.steps.filter((s) => s.kind === 'command' && s.ms > 0).map((s) => (s.kind === 'command' ? s.name : '')));
  if (cmds.length) {
    lines.push('');
    for (const name of cmds) {
      if (timed.has(name)) {
        lines.push(`${r}.registerCommand(${javaString(name)},`);
        lines.push('        () -> {',  '        },', '        () -> {', '        });');
      } else {
        lines.push(`${r}.registerCommand(${javaString(name)}, () -> {`, '});');
      }
    }
  }

  lines.push('');
  if (compiled.steps.length === 0) {
    lines.pop();
    return lines;
  }
  lines.push(r);
  for (const s of compiled.steps) {
    for (const l of stepLines(config, s)) lines.push(`        ${l}`);
  }
  lines[lines.length - 1] += ';';
  return lines;
}

function placementLines(compiled: CompileResult): string[] {
  const start = compiled.arrivals[0];
  if (!start) return [];
  const where = `x ${jDouble(start.x, 1)} in, y ${jDouble(start.y, 1)} in, heading ${jDouble(start.heading, 1)} deg`;
  return [`telemetry.addLine(${javaString(`Place the robot at ${where}`)});`];
}

export function generateJava(auto: Auto, config: HardwareConfig, robot: RobotSize = DEFAULT_ROBOT): GenerateResult {
  const compiled = compile(auto, config, robot);
  const tl = simulate(compiled.steps, config.drivetrain, config.constants);
  const errors = validateConfig(config, compiled);
  const className = toClassName(auto.name);
  const seq = sequenceLines(auto, config, compiled, robot);

  const code =
    config.output === 'snippet' ? [...seq, ''].join('\n') : opModeCode(auto, config, compiled, className, seq);

  return {
    code,
    className,
    errors,
    warnings: compiled.warnings,
    estSeconds: tl.total,
    stepCount: compiled.steps.length,
  };
}

export function hardwareInitLines(
  config: HardwareConfig,
  mechs: Mechanism[],
  varName: (expr: string) => string = (e) => e,
): { lines: string[]; imports: string[] } {
  const imports = [
    'com.qualcomm.robotcore.hardware.DcMotorEx',
    'com.qualcomm.robotcore.hardware.IMU',
    'com.qualcomm.hardware.rev.RevHubOrientationOnRobot',
  ];
  const lines: string[] = [];
  for (const k of usedMotorKeys(config)) {
    lines.push(`DcMotorEx ${varName(config.motors[k])} = hardwareMap.get(DcMotorEx.class, ${javaString(config.hardwareNames[k])});`);
  }
  for (const k of usedMotorKeys(config)) {
    if (config.reversedMotors[k]) {
      imports.push('com.qualcomm.robotcore.hardware.DcMotorSimple');
      lines.push(`${varName(config.motors[k])}.setDirection(DcMotorSimple.Direction.REVERSE);`);
    }
  }
  const imu = varName(config.imu);
  lines.push(`IMU ${imu} = hardwareMap.get(IMU.class, ${javaString(config.hardwareNames.imu)});`);
  lines.push(`${imu}.initialize(new IMU.Parameters(new RevHubOrientationOnRobot(`);
  lines.push(`        RevHubOrientationOnRobot.LogoFacingDirection.${config.hubLogo},`);
  lines.push(`        RevHubOrientationOnRobot.UsbFacingDirection.${config.hubUsb})));`);
  for (const m of mechs) {
    const type = m.kind === 'servo' ? 'Servo' : m.kind === 'crservo' ? 'CRServo' : 'DcMotorEx';
    imports.push(`com.qualcomm.robotcore.hardware.${type}`);
    lines.push(`${type} ${varName(m.javaExpr)} = hardwareMap.get(${type}.class, ${javaString(m.hardwareName)});`);
  }
  return { lines, imports };
}

function opModeCode(
  auto: Auto,
  config: HardwareConfig,
  compiled: CompileResult,
  className: string,
  seq: string[],
): string {
  const r = config.runnerVar;
  const mechs = usedMechanisms(compiled.steps, config);
  const declare = config.emitHardwareMapInit;
  const imports = new Set<string>([
    'com.qualcomm.robotcore.eventloop.opmode.Autonomous',
    'com.qualcomm.robotcore.eventloop.opmode.LinearOpMode',
  ]);
  if (config.runnerPackage !== config.packageName) imports.add(`${config.runnerPackage}.OverPath`);

  const body: string[] = [];
  if (declare) {
    const hw = hardwareInitLines(config, mechs);
    hw.imports.forEach((i) => imports.add(i));
    body.push(...hw.lines);
  }
  body.push('');
  body.push(...seq);
  body.push('');
  body.push(...placementLines(compiled));
  body.push(`telemetry.addLine("OverPath ready: " + ${r}.stepCount() + " steps");`);
  body.push('telemetry.update();');
  body.push('');
  body.push('waitForStart();');
  body.push(`${r}.start();`);
  body.push(`while (opModeIsActive() && ${r}.isBusy()) {`);
  body.push(`    ${r}.update();`);
  body.push(`    ${r}.addTelemetry(telemetry);`);
  body.push('    telemetry.update();');
  body.push('}');
  body.push(`${r}.stop();`);

  const ind = (l: string, n: number) => (l ? ' '.repeat(n) + l : l);
  return [
    `package ${config.packageName};`,
    '',
    ...[...imports].sort().map((i) => `import ${i};`),
    '',
    `@Autonomous(name = ${javaString(auto.name)}, group = ${javaString(config.opModeGroup || 'OverPath')})`,
    `public class ${className} extends LinearOpMode {`,
    '',
    '    @Override',
    '    public void runOpMode() {',
    ...body.map((l) => ind(l, 8)),
    '    }',
    '}',
    '',
  ].join('\n');
}
