import { describe, expect, it } from 'vitest';
import TUNER from '../../java/OverPathAutoTune.java?raw';
import OVERPATH from '../../java/OverPath.java?raw';
import { FILES_PORT, generateCalibrationOpMode } from '../codegen/calibration';
import { CALIBRATION_KEYS, ROBOT_FILES_URL } from '../codegen/calibrationFile';
import { RUNNER_DEFAULTS } from '../codegen/java';
import { RUNNER_VERSION } from '../codegen/version';
import { defaultConfig } from '../model/defaults';
import { MAX_DRIVE_POWER } from '../sim/simulate';

function javaDoubles(src: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of src.matchAll(/public double (\w+) = (-?[\d.]+);/g)) out[m[1]] = Number(m[2]);
  return out;
}

describe('planner ↔ OverPath.java', () => {
  const java = javaDoubles(OVERPATH);

  it('RUNNER_DEFAULTS match the library’s defaults', () => {
    for (const [k, v] of Object.entries(RUNNER_DEFAULTS)) expect([k, java[k]]).toEqual([k, v]);
  });

  it('the app’s default constants are the library’s defaults (no needless lines in generated code)', () => {
    const c = defaultConfig().constants;
    for (const [k, v] of Object.entries(RUNNER_DEFAULTS)) expect([k, c[k as keyof typeof c]]).toEqual([k, v]);
  });

  it('the preview’s power cap is OverPath.maxDrivePower', () => {
    expect(java.maxDrivePower).toBe(MAX_DRIVE_POWER);
  });

  it('versions match', () => {
    expect(OVERPATH).toContain(`public static final String VERSION = "${RUNNER_VERSION}";`);
  });

  it('the tuner writes exactly the values the planner imports', () => {
    const keys = /String\[\] keys = \{([^}]*)\}/.exec(TUNER)?.[1].match(/"(\w+)"/g)?.map((s) => s.slice(1, -1));
    expect(keys?.sort()).toEqual([...CALIBRATION_KEYS].sort());
  });

  it('the robot file page: one port everywhere', () => {
    expect(ROBOT_FILES_URL.endsWith(`:${FILES_PORT}`)).toBe(true);
    const calibration = generateCalibrationOpMode(defaultConfig()).code;
    expect(calibration).toContain(`new OverPathAutoTune.FileServer(${FILES_PORT})`);
    expect(calibration).toContain(`192.168.43.1:${FILES_PORT}`);
  });
});
