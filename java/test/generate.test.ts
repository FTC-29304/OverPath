import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { generateCalibrationOpMode } from '../../src/codegen/calibration';
import { generateJava } from '../../src/codegen/java';
import { defaultConfig, makeWaypoint } from '../../src/model/defaults';
import type { HardwareConfig } from '../../src/model/types';

const OUT = process.env.GEN_OUT;

test.skipIf(!OUT)('generate sample Java for javac', () => {
  for (const drivetrain of ['mecanum', 'tank'] as const) {
    for (const output of ['opmode', 'snippet'] as const) {
      const name = `Gen${drivetrain === 'tank' ? 'Tank' : 'Mecanum'}${output === 'snippet' ? 'Snippet' : ''}`;
      const config: HardwareConfig = { ...defaultConfig(), drivetrain, output, emitHardwareMapInit: true };
      const a = makeWaypoint(-36, -63, 90, 0.6);
      const b = makeWaypoint(-36, -24, 90, 0.8);
      b.actions = [{ id: 'w', kind: 'wait', ms: 300 }];
      const c = makeWaypoint(12, -24, 90, 0.7);
      const d = makeWaypoint(-58, -24, 180, 0.4);
      d.anchor = { wall: 'left', face: 'front', alignHeading: true, power: 0.3 };
      const robot = { lengthIn: 18, widthIn: 18 };
      const r = generateJava({ id: 'x', name, waypoints: [a, b, c, d] }, config, robot);
      if (r.errors.length) throw new Error(`${name}: ${JSON.stringify(r.errors)}`);
      const dir = `${OUT}/${config.packageName.replace(/\./g, '/')}`;
      mkdirSync(dir, { recursive: true });
      const code =
        output === 'opmode'
          ? r.code
          : [
              `package ${config.packageName};`,
              'import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;',
              'import com.qualcomm.robotcore.hardware.*;',
              `import ${config.runnerPackage}.OverPath;`,
              `public class ${name} extends LinearOpMode {`,
              '  DcMotorEx frontLeftMotor, frontRightMotor, backLeftMotor, backRightMotor; IMU imu;',
              '  @Override public void runOpMode() {',
              r.code,
              '  }',
              '}',
            ].join('\n');
      writeFileSync(`${dir}/${name}.java`, code);
      if (output === 'opmode') {
        const cal = generateCalibrationOpMode(config, robot);
        if (cal.errors.length) throw new Error(`calibration: ${JSON.stringify(cal.errors)}`);
        const cls = `OverPathCalibration${drivetrain === 'tank' ? 'Tank' : ''}`;
        writeFileSync(`${dir}/${cls}.java`, cal.code.replace('public class OverPathCalibration', `public class ${cls}`));
      }
      expect(code).toContain(`class ${name}`);
    }
  }
});
