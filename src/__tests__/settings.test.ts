import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../model/defaults';
import { MOTOR_PRESETS, WHEEL_PRESETS, matchMotor, matchWheel } from '../model/presets';
import { migrateSettings } from '../store/plannerStore';

describe('drive presets', () => {
  it('defaults point at real presets that match the default numbers', () => {
    const c = defaultConfig();
    expect(matchMotor(c.motorModel, c.constants.ticksPerRev)?.label).toContain('312 rpm');
    expect(matchWheel(c.wheelModel, c.constants.wheelDiameterIn)?.label).toContain('96 mm mecanum');
  });

  it('has unique ids, so every choice can be told apart', () => {
    expect(new Set(MOTOR_PRESETS.map((m) => m.id)).size).toBe(MOTOR_PRESETS.length);
    expect(new Set(WHEEL_PRESETS.map((w) => w.id)).size).toBe(WHEEL_PRESETS.length);
  });

  it('wheel diameters are the metric sizes in inches', () => {
    for (const w of WHEEL_PRESETS) {
      const mm = Number(w.label.match(/(\d+) mm/)![1]);
      expect(w.diameterIn).toBeCloseTo(mm / 25.4, 2);
    }
  });

  it('turns into "custom" once the number is edited by hand', () => {
    expect(matchMotor('gobilda-312', 537.7)).not.toBeNull();
    expect(matchMotor('gobilda-312', 540)).toBeNull();
    expect(matchWheel('gobilda-mecanum-96', 3.81)).toBeNull();
    expect(matchMotor('custom', 537.7)).toBeNull();
  });
});

describe('default motor names', () => {
  it('use the frontLeftMotor style', () => {
    expect(defaultConfig().motors).toEqual({
      leftFront: 'frontLeftMotor',
      rightFront: 'frontRightMotor',
      leftBack: 'backLeftMotor',
      rightBack: 'backRightMotor',
    });
  });

  it('migrates untouched v1 defaults but keeps a team’s own names', () => {
    const v1 = { leftFront: 'leftFront', rightFront: 'rightFront', leftBack: 'leftBack', rightBack: 'rightBack' };
    const untouched = migrateSettings({ config: { motors: { ...v1 }, hardwareNames: { ...v1, imu: 'imu' } } }, 1);
    expect(untouched.config.motors.leftFront).toBe('frontLeftMotor');
    expect(untouched.config.hardwareNames).toMatchObject({ rightBack: 'backRightMotor', imu: 'imu' });

    const custom = { ...v1, leftFront: 'driveTrain.lf' };
    const kept = migrateSettings({ config: { motors: custom } }, 1);
    expect(kept.config.motors).toEqual(custom);
  });

  it('moves the untouched old PathRunner package to the OverPath one', () => {
    const old = migrateSettings({ config: { runnerPackage: 'org.firstinspires.ftc.teamcode.pathplanner' } }, 2);
    expect(old.config.runnerPackage).toBe('org.firstinspires.ftc.teamcode.overpath');
    const custom = migrateSettings({ config: { runnerPackage: 'org.firstinspires.ftc.teamcode.drive' } }, 2);
    expect(custom.config.runnerPackage).toBe('org.firstinspires.ftc.teamcode.drive');
  });

  it('renames the untouched old OpMode group', () => {
    expect(migrateSettings({ config: { opModeGroup: 'PathPlanner' } }, 3).config.opModeGroup).toBe('OverPath');
    expect(migrateSettings({ config: { opModeGroup: 'Autos' } }, 3).config.opModeGroup).toBe('Autos');
  });
});

describe('repeatability test and calibration profiles', () => {
  it('reads results separated by spaces, semicolons or commas (and decimal commas)', async () => {
    const { runStats } = await import('../components/SettingsModal');
    expect(runStats('48')).toBeNull();
    const a = runStats('48.4 47.6; 48.0')!;
    expect(a.n).toBe(3);
    expect(a.mean).toBeCloseTo(48, 6);
    expect(a.sd).toBeCloseTo(0.4, 6);
    expect(runStats('48,4 47,6')!.mean).toBeCloseTo(48, 6);
    expect(runStats('48.4, 47.6')!.n).toBe(2);
  });

  it('keeps separate numbers for home tiles and the competition field', async () => {
    const { usePlanner } = await import('../store/plannerStore');
    const st = () => usePlanner.getState();
    st().resetConfig();
    st().setConstants({ wheelDiameterIn: 3.7, alongPct: 0.015 });
    st().switchProfile('competition');
    expect(st().config.activeProfile).toBe('competition');
    expect(st().config.constants.wheelDiameterIn).toBe(3.7);
    st().setConstants({ wheelDiameterIn: 3.85, alongPct: 0.03 });
    st().switchProfile('home');
    expect(st().config.constants).toMatchObject({ wheelDiameterIn: 3.7, alongPct: 0.015 });
    st().switchProfile('competition');
    expect(st().config.constants).toMatchObject({ wheelDiameterIn: 3.85, alongPct: 0.03 });
    expect(st().config.constants.ticksPerRev).toBe(537.7);
  });
});
