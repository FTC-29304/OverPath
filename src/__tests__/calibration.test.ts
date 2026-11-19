import { describe, expect, it } from 'vitest';
import { generateCalibrationOpMode } from '../codegen/calibration';
import { defaultConfig } from '../model/defaults';
import type { HardwareConfig } from '../model/types';

describe('Calibration OpMode', () => {
  it('mecanum: wheel test + drive + strafe + turn, with the team’s names and directions', () => {
    const r = generateCalibrationOpMode(defaultConfig());
    expect(r.errors).toEqual([]);
    expect(r.className).toBe('OverPathCalibration');
    expect(r.code).toContain('@TeleOp(name = "OverPath Calibration"');
    expect(r.code).toContain('DcMotorEx frontLeftMotor = hardwareMap.get(DcMotorEx.class, "frontLeftMotor");');
    expect(r.code).toContain('frontLeftMotor.setDirection(DcMotorSimple.Direction.REVERSE);');
    expect(r.code).toContain('newRunner().strafe(48, 0.5)');
    expect(r.code).toContain('OverPath.Drive.MECANUM, calibWheels[0], calibWheels[1], calibWheels[2], calibWheels[3]');
    expect(r.code).toMatchSnapshot();
  });

  it('has the auto-tune: buttons, the nested tuner, the file page, and saving calibration.json', () => {
    const r = generateCalibrationOpMode(defaultConfig());
    expect(r.code).toContain('static final class OverPathAutoTune {');
    expect(r.code).not.toContain('public final class OverPathAutoTune');
    expect(r.code.match(/^package /gm)).toHaveLength(1);
    expect(r.code).toContain('files = new OverPathAutoTune.FileServer(10159);');
    expect(r.code).toContain('if (files != null) files.close();');
    expect(r.code).toContain('autoTest("auto-tune", tuner.minPower() && tuner.speedAndBraking() && tuner.turnRadius(), "home");');
    expect(r.code).toContain('autoTest("venue check", tuner.venueCheck(), "competition");');
    expect(r.code).toContain('() -> opModeIsActive() && !gamepad1.y');
    expect(r.code).toContain('import java.net.ServerSocket;');
    expect(r.code).toContain('r.useHardwareMap(hardwareMap);');
  });

  it('the tuner uses the team’s drop rate, ramp and robot size', () => {
    const c = defaultConfig();
    c.constants = { ...c.constants, maxPowerDropPerS: 6.5, rampIn: 4 };
    const r = generateCalibrationOpMode(c, { lengthIn: 17, widthIn: 16.5 });
    expect(r.code).toContain('tuner.dropRate = 6.5;');
    expect(r.code).toContain('tuner.rampIn = 4.0;');
    expect(r.code).toContain('tuner.robotWidthIn = 16.5;');
    expect(generateCalibrationOpMode({ ...c, activeProfile: 'competition' }).code).toContain('tuner.turnRadius(), "competition");');
  });

  it('2-motor tank: no strafe test, two wheels, nulls for the back motors', () => {
    const c: HardwareConfig = { ...defaultConfig(), drivetrain: 'tank', tankMotorCount: 2 };
    const r = generateCalibrationOpMode(c);
    expect(r.errors).toEqual([]);
    expect(r.code).not.toContain('.strafe(');
    expect(r.code).not.toContain('B = strafe');
    expect(r.code).not.toContain('gamepad1.b)');
    expect(r.code).not.toContain('backLeftMotor');
    expect(r.code).toContain('calibWheels[0], calibWheels[1], null, null');
    expect(r.code).toMatchSnapshot();
  });

  it('turns field paths into plain local variables', () => {
    const c: HardwareConfig = {
      ...defaultConfig(),
      motors: {
        leftFront: 'driveTrain.frontLeftMotor',
        rightFront: 'driveTrain.frontRightMotor',
        leftBack: 'driveTrain.backLeftMotor',
        rightBack: 'driveTrain.backRightMotor',
      },
      imu: 'robot.imu',
    };
    const r = generateCalibrationOpMode(c);
    expect(r.errors).toEqual([]);
    expect(r.code).toContain('DcMotorEx frontLeftMotor = hardwareMap');
    expect(r.code).toContain('IMU imu = hardwareMap.get(IMU.class, "imu");');
    expect(r.code).not.toContain('driveTrain.frontLeftMotor =');
  });

  it('reports missing Robot Configuration names', () => {
    const c = defaultConfig();
    c.hardwareNames.leftFront = '';
    expect(generateCalibrationOpMode(c).errors.map((e) => e.path)).toContain('hardwareNames.leftFront');
  });

  it('carries non-default tuning into the test runner', () => {
    const c = defaultConfig();
    c.constants.turnKp = 0.01;
    expect(generateCalibrationOpMode(c).code).toContain('r.turnKp = 0.01;');
  });
});
